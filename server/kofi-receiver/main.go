package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Event struct {
	ID    string  `json:"id"`
	Ts    int64   `json:"ts"`
	Type  string  `json:"type"`
	Eur   float64 `json:"eur"`
	Sub   bool    `json:"sub"`
	Payer string  `json:"payer"`
	Name  *string `json:"name"`
}

type KofiPayload struct {
	MessageID             string          `json:"message_id"`
	Timestamp             string          `json:"timestamp"`
	Type                  string          `json:"type"`
	IsPublic              bool            `json:"is_public"`
	FromName              string          `json:"from_name"`
	Message               string          `json:"message"`
	Amount                json.RawMessage `json:"amount"`
	Currency              string          `json:"currency"`
	URL                   string          `json:"url"`
	Email                 string          `json:"email"`
	CurrencySymbol        string          `json:"currency_symbol"`
	VerificationToken     string          `json:"verification_token"`
	KofiTransactionID     string          `json:"kofi_transaction_id"`
	IsSubscriptionPayment bool            `json:"is_subscription_payment"`
}

type FundingOutput struct {
	MonthlyCostEur    float64 `json:"monthlyCostEur"`
	PledgedMonthlyEur float64 `json:"pledgedMonthlyEur"`
	RecurringEur      float64 `json:"recurringEur"`
	OneOffEur         float64 `json:"oneOffEur"`
	Updated           string  `json:"updated"`
}

type SupporterItem struct {
	Name string `json:"name"`
}

type SupportersOutput struct {
	Supporters []SupporterItem `json:"supporters"`
}

var (
	token          string
	port           int
	stateDir       string
	liveDir        string
	monthlyCostEur float64

	eventsFile    string
	testTxPattern = regexp.MustCompile(`^0{8}-1111-2222-3333-4{12}$`)

	mu     sync.Mutex
	events []Event
)

const (
	maxBody  = 64 * 1024
	dayMs    = int64(24 * 60 * 60 * 1000)
	windowMs = 31 * dayMs
	keepMs   = 400 * dayMs
)

func parseAmount(raw json.RawMessage) (float64, bool) {
	s := strings.Trim(string(raw), "\"")
	val, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(val) || math.IsInf(val, 0) || val <= 0 {
		return 0, false
	}
	return val, true
}

func parseTimestamp(s string) int64 {
	if s == "" {
		return time.Now().UnixMilli()
	}
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999Z",
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t.UnixMilli()
		}
	}
	return time.Now().UnixMilli()
}

func writeAtomic(file string, data any) error {
	tmp := fmt.Sprintf("%s.%d.tmp", file, os.Getpid())
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	bytes = append(bytes, '\n')
	if err := os.WriteFile(tmp, bytes, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, file)
}

func tokenOk(given string) bool {
	a := []byte(given)
	b := []byte(token)
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare(a, b) == 1
}

func payerKey(email string) string {
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte(strings.ToLower(strings.TrimSpace(email))))
	return hex.EncodeToString(mac.Sum(nil))[:16]
}

func cleanName(s string) string {
	var sb strings.Builder
	for _, r := range s {
		if r < 32 || r == 127 {
			continue
		}
		sb.WriteRune(r)
	}
	res := strings.TrimSpace(sb.String())
	runes := []rune(res)
	if len(runes) > 60 {
		runes = runes[:60]
	}
	return string(runes)
}

func round2(n float64) float64 {
	return math.Round(n*100) / 100
}

func publishLocked(now int64) {
	recent := make([]Event, 0, len(events))
	for _, e := range events {
		if now-e.Ts <= windowMs {
			recent = append(recent, e)
		}
	}

	subs := make(map[string]float64)
	var oneOffEur float64
	for _, e := range recent {
		if e.Sub {
			subs[e.Payer] = e.Eur
		} else {
			oneOffEur += e.Eur
		}
	}

	var recurringEur float64
	for _, v := range subs {
		recurringEur += v
	}

	funding := FundingOutput{
		MonthlyCostEur:    monthlyCostEur,
		PledgedMonthlyEur: round2(recurringEur + oneOffEur),
		RecurringEur:      round2(recurringEur),
		OneOffEur:         round2(oneOffEur),
		Updated:           time.UnixMilli(now).UTC().Format(time.RFC3339Nano),
	}
	_ = writeAtomic(filepath.Join(liveDir, "funding.json"), funding)

	seen := make(map[string]bool)
	supporters := make([]SupporterItem, 0, 200)
	for i := len(events) - 1; i >= 0; i-- {
		e := events[i]
		if e.Name == nil {
			continue
		}
		low := strings.ToLower(*e.Name)
		if seen[low] {
			continue
		}
		seen[low] = true
		supporters = append(supporters, SupporterItem{Name: *e.Name})
		if len(supporters) >= 200 {
			break
		}
	}
	_ = writeAtomic(filepath.Join(liveDir, "supporters.json"), SupportersOutput{Supporters: supporters})
}

func handle(payload KofiPayload) int {
	if !tokenOk(payload.VerificationToken) {
		return http.StatusUnauthorized
	}
	id := strings.TrimSpace(payload.MessageID)
	if id == "" {
		return http.StatusBadRequest
	}

	mu.Lock()
	defer mu.Unlock()

	for _, e := range events {
		if e.ID == id {
			return http.StatusOK
		}
	}

	if testTxPattern.MatchString(strings.TrimSpace(payload.KofiTransactionID)) {
		log.Printf("test event %s ignored", id)
		return http.StatusOK
	}
	if payload.Type != "Donation" && payload.Type != "Subscription" {
		log.Printf("event %s of type %s ignored", id, payload.Type)
		return http.StatusOK
	}

	amount, ok := parseAmount(payload.Amount)
	if !ok {
		return http.StatusBadRequest
	}

	if strings.ToUpper(strings.TrimSpace(payload.Currency)) != "EUR" {
		log.Printf("event %s in %s not counted (EUR only)", id, payload.Currency)
		return http.StatusOK
	}

	ts := parseTimestamp(payload.Timestamp)
	var name *string
	if payload.IsPublic {
		cleaned := cleanName(payload.FromName)
		if cleaned != "" {
			name = &cleaned
		}
	}

	events = append(events, Event{
		ID:    id,
		Ts:    ts,
		Type:  payload.Type,
		Eur:   amount,
		Sub:   payload.IsSubscriptionPayment,
		Payer: payerKey(payload.Email),
		Name:  name,
	})
	sort.Slice(events, func(i, j int) bool {
		return events[i].Ts < events[j].Ts
	})

	now := time.Now().UnixMilli()
	filtered := make([]Event, 0, len(events))
	for _, e := range events {
		if now-e.Ts <= keepMs {
			filtered = append(filtered, e)
		}
	}
	events = filtered
	_ = writeAtomic(eventsFile, events)
	publishLocked(now)

	subNotice := ""
	if payload.IsSubscriptionPayment {
		subNotice = " (subscription)"
	}
	log.Printf("recorded %s %s: €%.2f%s", payload.Type, id, amount, subNotice)
	return http.StatusOK
}

func setupConfig() {
	token = os.Getenv("KOFI_VERIFICATION_TOKEN")
	if token == "" {
		fmt.Fprintln(os.Stderr, "KOFI_VERIFICATION_TOKEN is not set")
		os.Exit(1)
	}

	portStr := os.Getenv("PORT")
	if portStr == "" {
		portStr = "8787"
	}
	p, err := strconv.Atoi(portStr)
	if err != nil {
		p = 8787
	}
	port = p

	stateDir = os.Getenv("STATE_DIR")
	if stateDir == "" {
		stateDir = "/var/lib/veyth"
	}

	liveDir = os.Getenv("LIVE_DIR")
	if liveDir == "" {
		liveDir = filepath.Join(stateDir, "live")
	}

	costStr := os.Getenv("MONTHLY_COST_EUR")
	if costStr == "" {
		costStr = "8"
	}
	cost, err := strconv.ParseFloat(costStr, 64)
	if err != nil {
		cost = 8
	}
	monthlyCostEur = cost

	eventsFile = filepath.Join(stateDir, "kofi-events.json")

	if err := os.MkdirAll(liveDir, 0755); err != nil {
		log.Printf("warning: mkdir %s failed: %v", liveDir, err)
	}

	data, err := os.ReadFile(eventsFile)
	if err == nil {
		var loaded []Event
		if err := json.Unmarshal(data, &loaded); err == nil {
			events = loaded
		}
	}
}

func kofiHandler(w http.ResponseWriter, r *http.Request) {
	reply := func(status int) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(status)
		if status == http.StatusOK {
			w.Write([]byte("ok"))
		} else {
			w.Write([]byte("error"))
		}
	}

	if r.Method != http.MethodPost || r.URL.Path != "/api/kofi" {
		reply(http.StatusNotFound)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			reply(http.StatusRequestEntityTooLarge)
			return
		}
		reply(http.StatusBadRequest)
		return
	}

	vals, err := url.ParseQuery(string(body))
	if err != nil {
		reply(http.StatusBadRequest)
		return
	}

	dataStr := vals.Get("data")
	if dataStr == "" {
		reply(http.StatusBadRequest)
		return
	}

	var payload KofiPayload
	if err := json.Unmarshal([]byte(dataStr), &payload); err != nil {
		log.Printf("bad request: %v", err)
		reply(http.StatusBadRequest)
		return
	}

	reply(handle(payload))
}

func main() {
	setupConfig()

	mu.Lock()
	publishLocked(time.Now().UnixMilli())
	mu.Unlock()

	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for t := range ticker.C {
			mu.Lock()
			publishLocked(t.UnixMilli())
			mu.Unlock()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/kofi", kofiHandler)

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	log.Printf("kofi receiver on %s", addr)
	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
