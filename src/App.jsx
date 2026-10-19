import React from "react";
import { supabase } from "./supabaseClient";
import AccountSetupGate from "./components/AccountSetupGate";
import Login from "./components/Login.jsx";
import MainApp from "./components/MainApp.jsx";
import ResetPassword from "./components/ResetPassword.jsx";
import CallOverlay from "./components/calls/CallOverlay.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";

function stripTrailingSlash(p) {
  return (p || "").replace(/\/+$/, "") || "/";
}

function detectBasePath() {
  const path = stripTrailingSlash(window.location.pathname);
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  return `/${parts[0]}`;
}

function getRelativeRoute(base) {
  const path = stripTrailingSlash(window.location.pathname);
  const hash = stripTrailingSlash((window.location.hash || "").replace(/^#/, ""));
  const effective = hash !== "/" ? hash : path;

  let rel = effective;
  if (base && effective.startsWith(base)) rel = effective.slice(base.length);

  if (!rel.startsWith("/")) rel = "/" + rel;
  return rel === "" ? "/" : rel;
}

export default function App() {
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState(null);
  const [connectFailed, setConnectFailed] = React.useState(false);

  const basePath = React.useMemo(() => detectBasePath(), []);
  const [route, setRoute] = React.useState(() => getRelativeRoute(basePath));
  const isResetPasswordRoute = route === "/reset-password";

  React.useEffect(() => {
    const timer = setTimeout(() => setConnectFailed(true), 20000);

    const onRouteChange = () => setRoute(getRelativeRoute(basePath));
    window.addEventListener("popstate", onRouteChange);
    window.addEventListener("hashchange", onRouteChange);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("getSession error:", error.message);
        setSession(data?.session ?? null);
      } catch (e) {
        console.error("getSession crashed:", e);
      } finally {
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", onRouteChange);
      window.removeEventListener("hashchange", onRouteChange);
      sub?.subscription?.unsubscribe();
    };
  }, [basePath]);

  // ---------------- LOADING ----------------
  if (loading) {
  return (
    <>
      <LoadingScreen />

      {connectFailed && (
        <div
          style={{
            position: "fixed",
            bottom: "40px",
            left: 0,
            right: 0,
            textAlign: "center",
            color: "#ffcc00",
            zIndex: 10001,
          }}
        >
          Connection with Rudal services failed. Please check
          {" "}rudal-messenger.github.io/rudal-status{" "}
          for server outages.
        </div>
      )}

      <CallOverlay />
      <audio id="rudal-remote-audio" autoPlay playsInline />
    </>
  );
}

  // ---------------- NOT LOGGED IN ----------------
  if (!session) {
    return (
      <>
        {isResetPasswordRoute ? (
          <ResetPassword basePath={basePath} />
        ) : (
          <Login basePath={basePath} />
        )}

        <CallOverlay />
        <audio id="rudal-remote-audio" autoPlay playsInline />
      </>
    );
  }

  // ---------------- LOGGED IN ----------------
  return (
    <>
      <AccountSetupGate session={session}>
  <MainApp session={session} />
</AccountSetupGate>

      {/* 🔥 FULLSCREEN CALL UI */}
      <CallOverlay />

      {/* 🔊 Global WebRTC audio sink */}
      <audio id="rudal-remote-audio" autoPlay playsInline />
    </>
  );
}
