import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Perfil({ user, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMsg("");
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data && !error) {
        await supabase.from("profiles").insert({ user_id: user.id, display_name: "" });
        setDisplayName("");
      } else {
        setDisplayName(data?.display_name || "");
      }
      setLoading(false);
    }
    load();
  }, [user.id]);

  async function saveName() {
    setSaving(true);
    setMsg("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: (displayName || "").trim() })
        .eq("user_id", user.id);
      if (error) throw error;
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
