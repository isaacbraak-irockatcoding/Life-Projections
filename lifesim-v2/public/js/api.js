/* ══════════════════════════════════════════════
   api.js — Fetch wrapper with in-memory JWT
   Token is stored in module closure, never
   written to localStorage (reduces XSS risk).
══════════════════════════════════════════════ */

const api = (() => {
  let _token = null;

  function setToken(token) {
    _token = token;
    sessionStorage.setItem('ls_token', token);
  }

  function clearToken() {
    _token = null;
    sessionStorage.removeItem('ls_token');
  }

  function getToken() { return _token; }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    setToken,
    clearToken,
    getToken,
    get:    (path)        => request('GET',    path),
    post:   (path, body)  => request('POST',   path, body),
    patch:  (path, body)  => request('PATCH',  path, body),
    delete: (path)        => request('DELETE', path),

    // Convenience methods
    getScenario:   (id)       => request('GET',    `/api/scenarios/${id}`),
    saveScenario:  (id, data) => request('PATCH',  `/api/scenarios/${id}`, data),
    createScenario:(data)     => request('POST',   '/api/scenarios', data),
    cloneScenario: (id, name) => request('POST',   `/api/scenarios/${id}/clone`, { name }),
    deleteScenario:(id)       => request('DELETE', `/api/scenarios/${id}`),

    createEvent:  (sid, data) => request('POST',   `/api/scenarios/${sid}/events`, data),
    deleteEvent:  (sid, eid)  => request('DELETE', `/api/scenarios/${sid}/events/${eid}`),

    createAsset:  (sid, data) => request('POST',   `/api/scenarios/${sid}/assets`, data),
    updateAsset:  (sid, aid, data) => request('PATCH', `/api/scenarios/${sid}/assets/${aid}`, data),
    deleteAsset:  (sid, aid)  => request('DELETE', `/api/scenarios/${sid}/assets/${aid}`),

    createDebt:   (sid, data) => request('POST',   `/api/scenarios/${sid}/debts`, data),
    updateDebt:   (sid, did, data) => request('PATCH', `/api/scenarios/${sid}/debts/${did}`, data),
    deleteDebt:   (sid, did)  => request('DELETE', `/api/scenarios/${sid}/debts/${did}`),

    createLifestyle: (sid, data)       => request('POST',   `/api/scenarios/${sid}/lifestyles`, data),
    updateLifestyle: (sid, lid, data)  => request('PATCH',  `/api/scenarios/${sid}/lifestyles/${lid}`, data),
    deleteLifestyle: (sid, lid)        => request('DELETE',  `/api/scenarios/${sid}/lifestyles/${lid}`),

    createSchool: (sid, data)        => request('POST',   `/api/scenarios/${sid}/schools`, data),
    updateSchool: (sid, scid, data)  => request('PATCH',  `/api/scenarios/${sid}/schools/${scid}`, data),
    deleteSchool: (sid, scid)        => request('DELETE',  `/api/scenarios/${sid}/schools/${scid}`),

    createCareer: (sid, data) => request('POST',   `/api/scenarios/${sid}/careers`, data),
    updateCareer: (sid, cid, data) => request('PATCH', `/api/scenarios/${sid}/careers/${cid}`, data),
    deleteCareer: (sid, cid)  => request('DELETE', `/api/scenarios/${sid}/careers/${cid}`),

    getShareLink: (sid)       => request('POST',   `/api/scenarios/${sid}/share`),
    revokeShare:  (sid)       => request('DELETE', `/api/scenarios/${sid}/share`),
    getPublicScenario: (token)=> request('GET',    `/api/share/${token}`),
    getComments:  (token)     => request('GET',    `/api/share/${token}/comments`),
    postComment:  (token, body) => request('POST', `/api/share/${token}/comments`, { body }),

    sendFriendRequest:(username) => request('POST', '/api/friends/request', { username }),
    acceptFriend:  (rid)      => request('POST',   `/api/friends/accept/${rid}`),
    removeFriend:  (uid)      => request('DELETE', `/api/friends/${uid}`),

    createGroup:       (name)             => request('POST',   '/api/groups', { name }),
    listGroups:        ()                 => request('GET',    '/api/groups'),
    getGroup:          (id)               => request('GET',    `/api/groups/${id}`),
    joinGroup:         (join_code)        => request('POST',   '/api/groups/join', { join_code }),
    publishToGroup:    (gid, scenario_id) => request('PATCH',  `/api/groups/${gid}/publish`, { scenario_id }),
    removeGroupMember: (gid, uid)         => request('DELETE', `/api/groups/${gid}/members/${uid}`),
    deleteGroup:       (gid)              => request('DELETE', `/api/groups/${gid}`),
  };
})();
