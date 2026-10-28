package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"mediahub/internal/media"
	"net/http"
	"net/url"
	"time"
)

// Ratings are supplemental: a failure must never hide the original media details.
func (a *API) enrichRatings(ctx context.Context, d *media.Detail) {
	key, err := a.store.ReadSecret("tmdb", "tmdb.mdblistApiKey")
	if err != nil || key == "" {
		return
	}
	if d.Provider != media.SourceTMDB {
		return
	}
	kind := string(d.MediaType)
	if kind == "tv" {
		kind = "show"
	}
	if kind != "movie" && kind != "show" {
		return
	}
	fingerprint := sha256.Sum256([]byte(key))
	cacheKey := fmt.Sprintf("mdblist:%x:%s:%s", fingerprint, kind, d.ProviderID)
	bounded, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	data, err := a.discoveryService().Cache.Load(bounded, "mdblist", cacheKey, 24*time.Hour, func(ctx context.Context) ([]byte, bool, error) {
		endpoint := "https://api.mdblist.com/tmdb/" + kind + "/" + url.PathEscape(d.ProviderID) + "/?apikey=" + url.QueryEscape(key)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, false, fmt.Errorf("评分请求无效")
		}
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, false, fmt.Errorf("评分服务暂不可用")
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return nil, false, fmt.Errorf("评分服务返回 HTTP %d", response.StatusCode)
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		if err != nil {
			return nil, false, fmt.Errorf("评分读取失败")
		}
		ratings, err := parseMDBRatings(body)
		if err != nil {
			return nil, false, err
		}
		encoded, err := json.Marshal(ratings)
		return encoded, false, err
	})
	if err != nil {
		d.RatingsMessage = "烂番茄与爆米花评分暂不可用，请检查 MDBList 密钥或稍后重试。"
		return
	}
	var ratings []media.Rating
	if json.Unmarshal(data, &ratings) == nil {
		d.Ratings = append(append([]media.Rating{}, d.Ratings...), ratings...)
	}
}
func parseMDBRatings(data []byte) ([]media.Rating, error) {
	var raw struct {
		Ratings []struct {
			Source string   `json:"source"`
			Value  *float64 `json:"value"`
			Votes  int64    `json:"votes"`
		} `json:"ratings"`
		Error json.RawMessage `json:"error"`
	}
	if json.Unmarshal(data, &raw) != nil || len(raw.Error) > 0 && string(raw.Error) != "null" {
		return nil, fmt.Errorf("评分响应无效")
	}
	out := []media.Rating{}
	seen := map[string]bool{}
	for _, r := range raw.Ratings {
		source := r.Source
		if source == "tomatoesaudience" || source == "audience" {
			source = "popcorn"
		}
		if source != "tomatoes" && source != "popcorn" || r.Value == nil || *r.Value < 0 || *r.Value > 100 || seen[source] {
			continue
		}
		seen[source] = true
		out = append(out, media.Rating{Source: media.Source(source), Value: *r.Value, VoteCount: r.Votes})
	}
	return out, nil
}
