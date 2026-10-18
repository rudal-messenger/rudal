{settingsOpen && (
  <div
    className="settings-overlay"
    onClick={() => setSettingsOpen(false)}
  >
    <div
      className="settings-modal skype-settings"
      onClick={(e) => e.stopPropagation()}
    >
      {/* LEFT SIDEBAR */}
      <aside className="settings-nav">
        <div className="settings-nav-title">Settings</div>

        <button
          className={`settings-nav-item ${
            settingsTab === "account" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("account")}
        >
          <span className="settings-nav-icon">♙</span>
          <span>Account &amp; Profile</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "general" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("general")}
        >
          <span className="settings-nav-icon">⚙</span>
          <span>General</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "appearance" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("appearance")}
        >
          <span className="settings-nav-icon">✎</span>
          <span>Appearance</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "audio" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("audio")}
        >
          <span className="settings-nav-icon">♩</span>
          <span>Audio &amp; Video</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "calling" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("calling")}
        >
          <span className="settings-nav-icon">☎</span>
          <span>Calling</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "messaging" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("messaging")}
        >
          <span className="settings-nav-icon">▤</span>
          <span>Messaging</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "notifications" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("notifications")}
        >
          <span className="settings-nav-icon">♢</span>
          <span>Notifications</span>
        </button>

        <button
          className={`settings-nav-item ${
            settingsTab === "about" ? "active" : ""
          }`}
          onClick={() => setSettingsTab("about")}
        >
          <span className="settings-nav-icon">ⓘ</span>
          <span>About Rudal</span>
        </button>
      </aside>

      {/* RIGHT SIDE */}
      <main className="settings-page">
        <button
          className="settings-close"
          onClick={() => setSettingsOpen(false)}
          title="Close"
        >
          ×
        </button>

        {/* ACCOUNT */}
        {settingsTab === "account" && (
          <>
            <div className="settings-section-label">ACCOUNT &amp; PROFILE</div>

            <div className="settings-profile-header">
              <img
                src={me?.avatar}
                className="settings-profile-avatar"
                alt=""
              />

              <div>
                <div className="settings-profile-name">
                  {me?.username || "Rudal User"}
                </div>
                <div className="settings-description">
                  Manage your Rudal profile
                </div>
              </div>
            </div>

            <div className="settings-section-label">PROFILE</div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Username</strong>
                <span>The name other Rudal users see.</span>
              </div>

              <input
                className="settings-input"
                type="text"
                value={me?.username || ""}
                onChange={(e) =>
                  setMe({ ...me, username: e.target.value })
                }
              />
            </div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Email</strong>
                <span>Your Rudal account email address.</span>
              </div>

              <input
                className="settings-input"
                type="email"
                value={me?.email || ""}
                onChange={(e) =>
                  setMe({ ...me, email: e.target.value })
                }
              />
            </div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Profile picture</strong>
                <span>Choose a picture for your Rudal profile.</span>
              </div>

              <label className="settings-outline-button">
                Change picture
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];

                    if (file) {
                      const url = URL.createObjectURL(file);
                      setMe({ ...me, avatar: url });
                    }
                  }}
                />
              </label>
            </div>

            <div className="settings-section-label">SECURITY</div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>New password</strong>
                <span>Change the password for your Rudal account.</span>
              </div>

              <input
                className="settings-input"
                type="password"
                placeholder="New password"
                onChange={(e) =>
                  setMe({ ...me, newPassword: e.target.value })
                }
              />
            </div>
          </>
        )}

        {/* GENERAL */}
        {settingsTab === "general" && (
          <>
            <div className="settings-section-label">GENERAL</div>

            <div className="settings-link-row">
              <div className="settings-row-main">
                <span className="settings-large-icon">A文</span>
                <strong>Language</strong>
              </div>

              <span className="settings-chevron">›</span>
            </div>

            <div className="settings-section-label">
              STATUS
            </div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Rudal status</strong>
                <span>
                  Choose how other people see your availability.
                </span>
              </div>

              <select
                className="settings-select"
                value={me?.status || "online"}
                onChange={(e) =>
                  setMe({ ...me, status: e.target.value })
                }
              >
                <option value="online">Available</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            <div className="settings-section-label">
              STARTUP AND CLOSE
            </div>

            <SettingsToggle
              title="Automatically start Rudal"
              description="Start Rudal automatically when you sign in."
            />

            <SettingsToggle
              title="Launch Rudal in the background"
              description="Rudal starts minimized and stays ready for messages."
            />

            <SettingsToggle
              title="On close, keep Rudal running"
              description="Keep Rudal running after closing the application window."
            />
          </>
        )}

        {/* APPEARANCE */}
        {settingsTab === "appearance" && (
          <>
            <div className="settings-section-label">APPEARANCE</div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <strong>Dark mode</strong>
                <span>Change the appearance of Rudal.</span>
              </div>

              <button
                className={`settings-switch ${darkMode ? "on" : ""}`}
                onClick={() => setDarkMode(!darkMode)}
              >
                <span />
              </button>
            </div>

            <div className="settings-link-row">
              <strong>Chat appearance</strong>
              <span className="settings-chevron">›</span>
            </div>
          </>
        )}

        {/* AUDIO */}
        {settingsTab === "audio" && (
          <>
            <div className="settings-section-label">AUDIO &amp; VIDEO</div>

            <div className="settings-link-row">
              <strong>Microphone</strong>
              <span className="settings-chevron">›</span>
            </div>

            <div className="settings-link-row">
              <strong>Speakers</strong>
              <span className="settings-chevron">›</span>
            </div>

            <div className="settings-link-row">
              <strong>Camera</strong>
              <span className="settings-chevron">›</span>
            </div>
          </>
        )}

        {/* CALLING */}
        {settingsTab === "calling" && (
          <>
            <div className="settings-section-label">CALLING</div>

            <SettingsToggle
              title="Incoming call sounds"
              description="Play a ringtone when somebody calls you."
              defaultOn
            />

            <SettingsToggle
              title="Call notifications"
              description="Show notifications for incoming Rudal calls."
              defaultOn
            />
          </>
        )}

        {/* MESSAGING */}
        {settingsTab === "messaging" && (
          <>
            <div className="settings-section-label">MESSAGING</div>

            <SettingsToggle
              title="Read receipts"
              description="Let people know when you've read their messages."
              defaultOn
            />

            <SettingsToggle
              title="Typing indicators"
              description="Show when you or another person is typing."
              defaultOn
            />

            <div className="settings-link-row">
              <strong>Message appearance</strong>
              <span className="settings-chevron">›</span>
            </div>
          </>
        )}

        {/* NOTIFICATIONS */}
        {settingsTab === "notifications" && (
          <>
            <div className="settings-section-label">NOTIFICATIONS</div>

            <SettingsToggle
              title="Message notifications"
              description="Show a notification when a new message arrives."
              defaultOn
            />

            <SettingsToggle
              title="Notification sounds"
              description="Play a sound when you receive a message."
              defaultOn
            />
          </>
        )}

        {/* ABOUT */}
        {settingsTab === "about" && (
          <>
            <div className="settings-section-label">ABOUT RUDAL</div>

            <div className="settings-about">
              <h2>Rudal</h2>
              <p>Rudal Communication Technologies</p>
              <p className="settings-description">
                Communication made simple.
              </p>
            </div>
          </>
        )}

        {/* BOTTOM ACTION BAR */}
        <div className="settings-bottom">
          <button
            className="settings-cancel"
            onClick={() => window.location.reload()}
          >
            Cancel
          </button>

          <button
            className="settings-save"
            onClick={async () => {
              const { data } = await supabase.auth.getUser();

              if (data?.user?.id) {
                await supabase
                  .from("profiles")
                  .update({
                    username: me.username,
                    email: me.email,
                    status: me.status,
                    avatar: me.avatar,
                  })
                  .eq("id", data.user.id);

                if (me.newPassword) {
                  await supabase.auth.updateUser({
                    password: me.newPassword,
                  });
                }
              }

              setSettingsOpen(false);
            }}
          >
            Save
          </button>
        </div>
      </main>
    </div>
  </div>
)}