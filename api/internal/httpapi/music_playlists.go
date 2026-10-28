package httpapi

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"mediahub/internal/store"
	"mediahub/internal/subsonic"
	"net/url"
	"strings"
	"sync"
	"time"
)

var playlistMu sync.Mutex

type musicPlaylist struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Owner   string   `json:"owner"`
	Created string   `json:"created"`
	Changed string   `json:"changed"`
	SongIDs []string `json:"songIds"`
}

func (a *API) musicPlaylists(owner, method string, p url.Values, library *subsonic.Library) (map[string]any, error) {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	values, _, err := a.store.ReadSettings("musicplaylists")
	if err != nil {
		return nil, err
	}
	lists := []musicPlaylist{}
	if value, ok := values["musicplaylists."+owner]; ok {
		raw, _ := json.Marshal(value)
		if err = json.Unmarshal(raw, &lists); err != nil {
			return nil, err
		}
	}
	songs := library.Snapshot().Songs
	render := func(list musicPlaylist, detail bool) map[string]any {
		entries := []subsonic.Song{}
		duration := 0
		for _, id := range list.SongIDs {
			for _, song := range songs {
				if song.ID == id {
					entries = append(entries, song)
					duration += song.Duration
					break
				}
			}
		}
		result := map[string]any{"id": list.ID, "name": list.Name, "owner": list.Owner, "public": false, "created": list.Created, "changed": list.Changed, "songCount": len(entries), "duration": duration}
		if detail {
			result["entry"] = entries
		}
		return result
	}
	id := p.Get("id")
	if id == "" {
		id = p.Get("playlistId")
	}
	index := -1
	for i, list := range lists {
		if list.ID == id {
			index = i
		}
	}
	switch method {
	case "getPlaylists":
		result := []map[string]any{}
		for _, list := range lists {
			result = append(result, render(list, false))
		}
		return map[string]any{"playlists": map[string]any{"playlist": result}}, nil
	case "getPlaylist":
		if index < 0 {
			return nil, fmt.Errorf("歌单不存在")
		}
		return map[string]any{"playlist": render(lists[index], true)}, nil
	case "createPlaylist":
		if id != "" && index < 0 {
			return nil, fmt.Errorf("歌单不存在")
		}
		if index < 0 {
			name := strings.TrimSpace(p.Get("name"))
			if name == "" || len(name) > 300 {
				return nil, fmt.Errorf("请填写歌单名称（最多100个汉字）")
			}
			now := time.Now().UTC().Format(time.RFC3339Nano)
			lists = append(lists, musicPlaylist{ID: fmt.Sprintf("pl-%d", time.Now().UnixNano()), Name: name, Owner: owner, Created: now})
			index = len(lists) - 1
		}
		ids := p["songId"]
		if p.Get("append") == "true" {
			ids = append(lists[index].SongIDs, ids...)
		}
		for _, id := range ids {
			found := false
			for _, song := range songs {
				if song.ID == id {
					found = true
					break
				}
			}
			if !found {
				return nil, fmt.Errorf("歌曲不存在，请刷新曲库")
			}
		}
		lists[index].SongIDs = ids
		lists[index].Changed = time.Now().UTC().Format(time.RFC3339Nano)
		raw, err := json.Marshal(lists)
		if err != nil {
			return nil, err
		}
		if err = a.store.SaveSettings("musicplaylists", map[string]json.RawMessage{"musicplaylists." + owner: raw}, nil); err != nil {
			return nil, err
		}
		return map[string]any{"playlist": render(lists[index], true)}, nil
	}
	return nil, fmt.Errorf("歌单操作不支持")
}
func (a *API) mountMusicPlaylists(v1 *gin.RouterGroup, library *subsonic.Library) {
	v1.GET("/music/playlists", func(c *gin.Context) {
		user, _ := currentUser(c)
		result, err := a.musicPlaylists(user.ID, "getPlaylists", url.Values{}, library)
		if err != nil {
			fail(c, 500, err.Error())
			return
		}
		c.JSON(200, result)
	})
	v1.GET("/music/playlists/:id", func(c *gin.Context) {
		user, _ := currentUser(c)
		result, err := a.musicPlaylists(user.ID, "getPlaylist", url.Values{"id": {c.Param("id")}}, library)
		if err != nil {
			fail(c, 404, err.Error())
			return
		}
		c.JSON(200, result)
	})
	v1.POST("/music/playlists", a.requireUser(), func(c *gin.Context) {
		var body struct {
			Name    string   `json:"name"`
			ID      string   `json:"id"`
			SongIDs []string `json:"songIds"`
			Append  bool     `json:"append"`
		}
		if c.ShouldBindJSON(&body) != nil {
			fail(c, 400, "歌单格式无效")
			return
		}
		user, _ := currentUser(c)
		p := url.Values{"name": {body.Name}, "playlistId": {body.ID}, "songId": body.SongIDs, "append": {fmt.Sprint(body.Append)}}
		result, err := a.musicPlaylists(user.ID, "createPlaylist", p, library)
		if err != nil {
			fail(c, 400, err.Error())
			return
		}
		c.JSON(200, result)
	})
}
func (a *API) playlistOwner(key string) (string, error) {
	user, err := a.store.APIKeyUser(store.HashToken(key))
	return user.ID, err
}
