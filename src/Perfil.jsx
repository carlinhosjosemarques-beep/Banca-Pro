import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Perfil({ user, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [profileKey, setProfileKey] = useState(null);

  async function fetchProfileSafe(uid, email) {
    const cols = "id,user_id,email,display_name";

    let r = await supabase.from("profiles").select(cols).eq("id", uid).maybeSingle();
    if (r.error) throw r.error;
    if (r.data) return { data: r.data, key: { by: "id", value: uid } };

    let r2 = await supabase.from("profiles").select(cols).eq("user_id", uid).maybeSingle();
    if (r2.error) throw r2.error;
    if (r2.data) return { data: r2.data, key: { by: "user_id", value: uid } };

    if (email) {
      let r3 = await supabase.from("profiles").select(cols).eq("email", email).maybeSingle();
      if (r3.error) throw r3.error;
      if (r3.data) return { data: r3.data, key: { by: "email", value: email } };
    }

    return { data: null, key: null };
  }

  async function ensureProfile(uid, email) {
    const found = await fetchProfileSafe(uid, email);
    if (found.data) return found;

    const payload = { id: uid, user_id: uid, email: email || null, display_name: "" };
    let ins = await supabase.from("profiles").insert(payload).select("id,user_id,email,display_name").single();

    if (ins.error) {
      const payload2 = { user_id: uid, email: email || null, display_name: "" };
      let ins2 = await supabase.from("profiles").insert(payload2).select("id,user_id,email,display_name").single();
      if (ins2.error) throw ins2.error;
      return { data: ins2.data, key: { by: "id", value: ins2.data.id } };
    }

    return { data: ins.data, key: { by: "id", value: uid } };
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMsg("");
      try {
        const { data, key } = await ensureProfile(user.id, user.email);
        setDisplayName(data?.display_name || "");
        setProfileKey(key || { by: "id", value: user.id });
      } catch (e) {
        setMsg(e?.message || "Erro ao carregar perfil");
        setProfileKey({ by: "id", value: user.id });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.id, user.email]);

  async function saveName() {
    setSaving(true);
    setMsg("");
    try {
      const name = (displayName || "").trim();

      if (profileKey?.by === "user_id") {
        const { error } = await supabase.from("profiles").update({ display_name: name }).eq("user_id", user.id);
        if (error) throw error;
      } else if (profileKey?.by === "email") {
        const { error } = await supabase.from("profiles").update({ display_name: name }).eq("email", user.email);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
        if (error) {
          const { error: e2 } = await supabase.from("profiles").update({ display_name: name }).eq("user_id", user.id);
          if (e2) throw e2;
          setProfileKey({ by: "user_id", value: user.id });
        } else {
          setProfileKey({ by: "id", value: user.id });
        }
      }

      setMsg("Nome salvo ✅");
    } catch (e) {
      setMsg(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function updatePassword() {
    setSaving(true);
    setMsg("");
    try {
      if (!newPass || newPass.length < 6) throw new Error("Senha precisa ter no mínimo 6 caracteres.");
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setNewPass("");
      setMsg("Senha atualizada ✅");
    } catch (e) {
      setMsg(e?.message || "Erro ao atualizar senha");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "grid", placeItems: "center", gap: 10 }}>
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: 26,
              border: "1px solid var(--line)",
              background: "rgba(255,255,255,.05)",
              display: "grid",
              placeItems: "center",
              fontSize: 34
            }}
          >
            👤
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {(displayName || "").trim() ? displayName : "Sem nome ainda"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{user.email}</div>
          </div>
        </div>

        <div className="hr" />

        {loading ? <div className="muted">Carregando...</div> : null}
        {msg ? <div className="muted" style={{ marginTop: 8 }}>{msg}</div> : null}

        <div className="field" style={{ marginTop: 10 }}>
          <div className="label">Nome de exibição</div>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <button className="btn primary" style={{ marginTop: 10 }} disabled={saving} onClick={saveName}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        <div className="hr" />

        <div className="field">
          <div className="label">Trocar senha</div>
          <input
            className="input"
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="mínimo 6 caracteres"
          />
          <button className="btn warn" style={{ marginTop: 10 }} disabled={saving} onClick={updatePassword}>
            {saving ? "Atualizando..." : "Atualizar senha"}
          </button>
        </div>

        <div className="hr" />

        <button className="btn danger" onClick={onLogout} style={{ width: "100%" }}>
          Sair
        </button>
      </div>
    </div>
  );
}
