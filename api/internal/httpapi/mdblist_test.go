package httpapi

import "testing"

func TestParseMDBRatings(t *testing.T) {
	ratings, err := parseMDBRatings([]byte(`{"ratings":[{"source":"tomatoes","value":0,"votes":5},{"source":"popcorn","value":92},{"source":"imdb","value":8},{"source":"tomatoes","value":80},{"source":"popcorn","value":null}]}`))
	if err != nil || len(ratings) != 2 || ratings[0].Value != 0 || ratings[1].Value != 92 || ratings[0].VoteCount != 5 {
		t.Fatalf("ratings=%+v err=%v", ratings, err)
	}
	ratings, err = parseMDBRatings([]byte(`{"ratings":[{"source":"audience","value":89},{"source":"tomatoes","value":101}]}`))
	if err != nil || len(ratings) != 1 || ratings[0].Source != "popcorn" {
		t.Fatalf("ratings=%+v err=%v", ratings, err)
	}
	for _, raw := range []string{`not json`, `{"error":"Invalid API key"}`} {
		if _, err := parseMDBRatings([]byte(raw)); err == nil {
			t.Fatal("accepted invalid response")
		}
	}
}
