import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Login from "./Login";
import "../styles/AccountSetup.css";
import LoadingScreen from "./LoadingScreen";

const BASE = import.meta.env.BASE_URL || "/";

// Replace these placeholders with your final tour content.
const TOUR = Array.from({ length: 5 }, (_, index) => ({
  title: `Tour page ${index + 1}`,
  text: `Text placeholder for tour page ${
    index + 1
  }. Replace this with your introduction.`,
  image: null,
}));

function SetupForm({ profile, countries, onDone }) {
  const [username, setUsername] =
    useState(profile.username || "");

  const [age, setAge] = useState("");

  const matching = countries.filter(
    (country) =>
      country.calling_code === profile.rudal_country_code
  );

  const [country, setCountry] = useState(
    matching.length === 1 ? matching[0].iso_code : ""
  );

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");

    try {
      let path = null;

      if (file) {
        const ext = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        }[file.type];

        if (!ext || file.size > 5 * 1024 * 1024) {
          throw new Error(
            "Choose a JPG, PNG or WebP image under 5 MB."
          );
        }

        path =
          `${profile.id}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } =
          await supabase.storage
            .from("avatars")
            .upload(path, file, {
              contentType: file.type,
              upsert: false,
            });

        if (uploadError) throw uploadError;
      }

      const { error: setupError } = await supabase.rpc(
        "complete_account_setup",
        {
          p_username: username.trim(),
          p_age: Number(age),
          p_country_iso: country,
          p_avatar_path: path,
        }
      );

      if (setupError) throw setupError;

      onDone();
    } catch (err) {
      setError(
        err.message || "Account setup failed."
      );
    } finally {
      setBusy(false);
    }
  }

  const selected = countries.find(
    (item) => item.iso_code === country
  );

  return (
    <form className="setup-card" onSubmit={submit}>
      <img
        className="setup-logo"
        src={`${BASE}RudalLogo.png`}
        alt="Rudal"
      />

      <p className="setup-eyebrow">
        YOUR RUDAL ACCOUNT
      </p>

      <h1>Make it yours.</h1>

      <p>
        Set up your profile before your first conversation.
      </p>

      <fieldset disabled={busy} className="setup-fields">
       <label>
  Username
  <input
    required
    minLength={3}
    maxLength={30}
    autoComplete="username"
    value={username}
    onChange={(e) => setUsername(e.target.value)}
  />
</label>

<small>Choose a username with 3–30 characters.</small>

        <label>
          Your age
          <input
            required
            type="number"
            min="1"
            max="120"
            step="1"
            value={age}
            onChange={(e) =>
              setAge(e.target.value)
            }
          />
        </label>

        <small>
          Private account information. Other users cannot
          see your age.
        </small>

        <label>
          Country
          <select
            required
            value={country}
            onChange={(e) =>
              setCountry(e.target.value)
            }
          >
            <option value="">
              Choose your country
            </option>

            {countries.map((item) => (
              <option
                key={item.iso_code}
                value={item.iso_code}
                disabled={
                  profile.rudal_country_code != null &&
                  item.calling_code !==
                    profile.rudal_country_code
                }
              >
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <small>
          {selected
            ? `Your Rudal prefix: ${
                1000 + selected.calling_code
              }. Your number is generated automatically.`
            : "Your country determines your Rudal number prefix."}
        </small>

        {profile.rudal_number && (
          <small>
            Your existing Rudal number is kept:{" "}
            {profile.rudal_number}
          </small>
        )}

        <label>
          Profile picture
          <div className="setup-avatar-row">
            <img
              className="setup-avatar"
              src={
                preview ||
                profile.avatar ||
                `${BASE}rudal-default.jpg`
              }
              alt="Your profile preview"
            />

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) =>
                setFile(e.target.files?.[0] || null)
              }
            />
          </div>
        </label>

        <small>
          JPG, PNG or WebP, up to 5 MB. Keep the default
          picture if you prefer.
        </small>

        {file && (
          <button
            className="setup-secondary"
            type="button"
            onClick={() => setFile(null)}
          >
            Keep current/default picture
          </button>
        )}

        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="setup-primary"
          type="submit"
        >
          {busy
            ? "Setting up…"
            : "Save and continue"}
        </button>
      </fieldset>
    </form>
  );
}

function WelcomeTour({ initialStep, onDone }) {
  const [page, setPage] = useState(initialStep || 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const slide = TOUR[page];

  async function navigate(next, complete = false) {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const { error } = await supabase.rpc(
        "save_account_tour",
        {
          p_step: next,
          p_complete: complete,
        }
      );

      if (error) throw error;

      if (complete) {
        onDone();
      } else {
        setPage(next);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-card setup-tour">
      <p className="setup-eyebrow">
        WELCOME TO RUDAL · {page + 1} / 5
      </p>

      {slide.image ? (
        <img
          className="setup-tour-image"
          src={slide.image}
          alt={slide.title}
        />
      ) : (
        <div className="setup-tour-image setup-placeholder">
          Image placeholder {page + 1}
        </div>
      )}

      <h1>{slide.title}</h1>
      <p>{slide.text}</p>

      <div
        className="setup-dots"
        aria-label={`Tour page ${page + 1} of 5`}
      >
        {TOUR.map((_, index) => (
          <span
            key={index}
            className={index === page ? "active" : ""}
          />
        ))}
      </div>

      {error && (
        <p className="setup-error" role="alert">
          {error}
        </p>
      )}

      <div className="setup-actions">
        <button
          className="setup-secondary"
          disabled={busy || page === 0}
          onClick={() => navigate(page - 1)}
        >
          Back
        </button>

        <button
          className="setup-primary"
          disabled={busy}
          onClick={() =>
            navigate(
              page === 4 ? 4 : page + 1,
              page === 4
            )
          }
        >
          {busy
            ? "Saving…"
            : page === 4
            ? "Start using Rudal"
            : "Next"}
        </button>
      </div>
    </div>
  );
}

export default function AccountSetupGate({
  session,
  children,
}) {
  const [revision, setRevision] = useState(0);

  const [state, setState] = useState({
    phase: "loading",
  });

  const reload = () =>
    setRevision((value) => value + 1);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.error) {
        setState({
          phase: "error",
          message: event.detail.error,
        });
      } else {
        reload();
      }
    };

    window.addEventListener(
      "rudal-auth-ready",
      handler
    );

    return () =>
      window.removeEventListener(
        "rudal-auth-ready",
        handler
      );
  }, []);

  useEffect(() => {
    let active = true;
    let timer;

    setState({ phase: "loading" });

    if (window.rudalAuthPending) {
      return () => {
        active = false;
      };
    }

    async function load() {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!auth.user?.email_confirmed_at) {
        return { phase: "verify" };
      }

      const uid = auth.user.id;

      const [
        profileResult,
        setupResult,
        countriesResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, username, avatar, rudal_number, rudal_country_code, encrypted_master_key"
          )
          .eq("id", uid)
          .single(),

        supabase
          .from("account_setup")
          .select("tour_step, tour_completed_at")
          .eq("user_id", uid)
          .maybeSingle(),

        supabase
          .from("rudal_countries")
          .select("iso_code, calling_code"),
      ]);

      for (const result of [
        profileResult,
        setupResult,
        countriesResult,
      ]) {
        if (result.error) throw result.error;
      }

      if (
        profileResult.data.encrypted_master_key &&
        !sessionStorage.getItem(
          `rudal_master_key_${uid}`
        )
      ) {
        return { phase: "unlock" };
      }

      if (setupResult.data?.tour_completed_at) {
        return { phase: "ready" };
      }

      if (setupResult.data) {
        return {
          phase: "tour",
          step: setupResult.data.tour_step,
        };
      }

      const names = new Intl.DisplayNames(
        [navigator.language || "en"],
        { type: "region" }
      );

      const countries = (
        countriesResult.data || []
      )
        .map((country) => ({
          ...country,
          name:
            names.of(country.iso_code) ||
            country.iso_code,
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name)
        );

      return {
        phase: "setup",
        profile: profileResult.data,
        countries,
      };
    }

    Promise.race([
      load(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Account setup could not load. Please retry."
              )
            ),
          20000
        );
      }),
    ])
      .then((result) => {
        if (active) setState(result);
      })
      .catch((error) => {
        if (active) {
          setState({
            phase: "error",
            message: error.message,
          });
        }
      })
      .finally(() => clearTimeout(timer));

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session.user.id, revision]);

if (state.phase === "loading") {
  return <LoadingScreen />;
}

  if (state.phase === "ready") {
    return children;
  }

  if (state.phase === "unlock") {
    return (
      <>
        <div className="setup-unlock-note">
          Sign in once to unlock your encrypted
          account on this tab.
        </div>
        <Login />
      </>
    );
  }

  return (
    <main className="account-setup">

      {state.phase === "error" && (
        <div className="setup-card">
          <p role="alert">{state.message}</p>
          <button
            className="setup-primary"
            onClick={reload}
          >
            Retry
          </button>
        </div>
      )}

      {state.phase === "verify" && (
        <div className="setup-card">
          <h1>Verify your email</h1>
          <p>
            Open the verification link in your email,
            then sign in.
          </p>

          <button
            className="setup-primary"
            onClick={() => supabase.auth.signOut()}
          >
            Back to sign in
          </button>
        </div>
      )}

      {state.phase === "setup" && (
        <SetupForm
          profile={state.profile}
          countries={state.countries}
          onDone={reload}
        />
      )}

      {state.phase === "tour" && (
        <WelcomeTour
          initialStep={state.step}
          onDone={reload}
        />
      )}
    </main>
  );
}