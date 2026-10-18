let notifySound, callSound;
let permissionRequested = false;

export const initSounds = () => {
  notifySound = new Audio("/sounds/notify.m4a");
  callSound = new Audio("/sounds/call.m4a");
  callSound.loop = true;
  notifySound.load();
  callSound.load();

  if (!permissionRequested && "Notification" in window) {
    Notification.requestPermission();
    permissionRequested = true;
  }
};

export const showNotification = async (title, body, icon = "/RudalLogo.png") => {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, { body, icon });
  } else if (Notification.permission !== "denied") {
    const perm = await Notification.requestPermission();
    if (perm === "granted") new Notification(title, { body, icon });
  }

  try {
    notifySound.currentTime = 0;
    await notifySound.play();
  } catch (e) {
    console.warn("🔇 Notification sound blocked (autoplay)");
  }
};

export const playCall = async () => {
  try {
    callSound.currentTime = 0;
    await callSound.play();
  } catch (e) {
    console.warn("🔇 Call sound blocked until interaction");
  }
};

export const stopCall = () => {
  callSound.pause();
  callSound.currentTime = 0;
};
