package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestKofiReceiver(t *testing.T) {
	tmpDir := t.TempDir()
	token = "secret123"
	monthlyCostEur = 8
	stateDir = tmpDir
	liveDir = filepath.Join(tmpDir, "live")
	eventsFile = filepath.Join(tmpDir, "kofi-events.json")
	events = nil
	_ = os.MkdirAll(liveDir, 0755)

	ts := httptest.NewServer(http.HandlerFunc(kofiHandler))
	defer ts.Close()

	// 1. Wrong method
	resp, err := http.Get(ts.URL + "/api/kofi")
	if err != nil || resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 on GET, got %v, err %v", resp.StatusCode, err)
	}

	// 2. Wrong token (401)
	postKofi := func(payload map[string]any) (int, string) {
		b, _ := json.Marshal(payload)
		vals := url.Values{"data": {string(b)}}
		r, err := http.Post(ts.URL+"/api/kofi", "application/x-www-form-urlencoded", strings.NewReader(vals.Encode()))
		if err != nil {
			t.Fatalf("post error: %v", err)
		}
		defer r.Body.Close()
		return r.StatusCode, r.Status
	}

	code, _ := postKofi(map[string]any{
		"verification_token": "wrong",
		"message_id":         "m1",
	})
	if code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on wrong token, got %d", code)
	}

	// 3. Test transaction (200, ignored)
	code, _ = postKofi(map[string]any{
		"verification_token":  "secret123",
		"message_id":          "m-test",
		"kofi_transaction_id": "00000000-1111-2222-3333-444444444444",
		"type":                "Donation",
		"amount":              "10.00",
		"currency":            "EUR",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200 on test tx, got %d", code)
	}
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}

	// 4. Valid donation
	code, _ = postKofi(map[string]any{
		"verification_token": "secret123",
		"message_id":         "m-don-1",
		"type":               "Donation",
		"amount":             "15.50",
		"currency":           "EUR",
		"email":              "alice@example.com",
		"from_name":          "Alice\u0000",
		"is_public":          true,
		"timestamp":          "2026-10-17T20:00:00Z",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200 on donation, got %d", code)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Eur != 15.50 || *events[0].Name != "Alice" {
		t.Fatalf("event data mismatch: %+v", events[0])
	}

	// Check funding.json and supporters.json
	fundingData, err := os.ReadFile(filepath.Join(liveDir, "funding.json"))
	if err != nil {
		t.Fatalf("failed to read funding.json: %v", err)
	}
	var funding FundingOutput
	if err := json.Unmarshal(fundingData, &funding); err != nil {
		t.Fatalf("failed to unmarshal funding.json: %v", err)
	}
	if funding.OneOffEur != 15.50 || funding.PledgedMonthlyEur != 15.50 {
		t.Fatalf("funding mismatch: %+v", funding)
	}

	// 5. Duplicate message_id (200, no duplicate added)
	code, _ = postKofi(map[string]any{
		"verification_token": "secret123",
		"message_id":         "m-don-1",
		"type":               "Donation",
		"amount":             "15.50",
		"currency":           "EUR",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200 on duplicate, got %d", code)
	}
	if len(events) != 1 {
		t.Fatalf("expected still 1 event after duplicate, got %d", len(events))
	}

	// 6. Subscription
	code, _ = postKofi(map[string]any{
		"verification_token":     "secret123",
		"message_id":             "m-sub-1",
		"type":                   "Subscription",
		"amount":                 "5.00",
		"currency":               "EUR",
		"email":                  "bob@example.com",
		"from_name":              "Bob",
		"is_public":              true,
		"is_subscription_payment": true,
		"timestamp":              "2026-10-17T21:00:00Z",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200 on subscription, got %d", code)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}

	// Check funding.json
	fundingData, _ = os.ReadFile(filepath.Join(liveDir, "funding.json"))
	_ = json.Unmarshal(fundingData, &funding)
	if funding.RecurringEur != 5.00 || funding.OneOffEur != 15.50 || funding.PledgedMonthlyEur != 20.50 {
		t.Fatalf("funding recurring mismatch: %+v", funding)
	}

	// 7. Non-EUR currency (200, ignored)
	code, _ = postKofi(map[string]any{
		"verification_token": "secret123",
		"message_id":         "m-usd-1",
		"type":               "Donation",
		"amount":             "20.00",
		"currency":           "USD",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200 on non-EUR, got %d", code)
	}
	if len(events) != 2 {
		t.Fatalf("expected still 2 events after USD, got %d", len(events))
	}
}
