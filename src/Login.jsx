import { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const title = useMemo(() => (mode === "login" ? "Entrar" : "Criar conta"), [mode]);

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pass });
        if (error) throw error;
        setMsg("Conta criada. Se o Supabase pedir confirmação por email, confirme e depois entre.");
        setMode("login");
      }
    } catch (err) {
      setMsg(err?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 30 }}>
      <div className="card">
        <div className="brand" style={{ marginBottom: 14 }}>
          <div className="logo" />
          <div>
            <h1>Banca Pro</h1>
            <p>Gestão simples e profissional da sua banca</p>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 10 }}>
          <button className={"tab " + (mode === "login" ? "active" : "")} onClick={() => setMode("login")}>
            Entrar
          </button>
          <button className={"tab " + (mode === "signup" ? "active" : "")} onClick={() => setMode("signup")}>
            Criar conta
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="field" style={{ width: "100%", marginBottom: 10 }}>
            <div className="label">Email</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>

          <div className="field" style={{ width: "100%", marginBottom: 14 }}>
            <div className="label">Senha</div>
            <input className="input" value={pass} onChange={(e) => setPass(e.target.value)} type="password" required />
          </div>

          <button className="btn primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Aguarde..." : title}
          </button>

          {msg ? <p className="muted" style={{ marginTop: 12 }}>{msg}</p> : null}
        </form>

        <div className="hr" />

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Dica: use uma senha forte. Você vai operar isso como um app real.
        </p>
      </div>
    </div>
  );
}
