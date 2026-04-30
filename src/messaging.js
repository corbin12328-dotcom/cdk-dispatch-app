import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { app, db } from "./firebase";

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

async function getSupportedMessaging() {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return null;
  return (await isSupported()) ? getMessaging(app) : null;
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export async function getMessagingToken() {
  const messaging = await getSupportedMessaging();
  if (!messaging) {
    throw new Error("Firebase Cloud Messaging is not supported in this browser.");
  }
  if (!vapidKey) {
    throw new Error("Missing VITE_FIREBASE_VAPID_KEY. Add your Firebase Web Push certificate key to the environment.");
  }

  const serviceWorkerRegistration = await navigator.serviceWorker.ready;
  return getToken(messaging, { vapidKey, serviceWorkerRegistration });
}

export async function saveMessagingToken({ role, token, user, tech }) {
  const tokenRecord = {
    token,
    userAgent: navigator.userAgent,
    updatedAt: serverTimestamp()
  };

  if (role === "dispatcher") {
    await setDoc(doc(db, "dispatchNotificationTargets", user.uid), {
      ...tokenRecord,
      authUid: user.uid,
      email: user.email || null,
      active: true,
      createdAt: serverTimestamp()
    }, { merge: true });
    return;
  }

  if (!tech?.id) {
    throw new Error("Could not find the logged-in technician record.");
  }

  await updateDoc(doc(db, "techs", tech.id), {
    fcmTokens: arrayUnion(token),
    fcmToken: token,
    fcmTokenUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function showForegroundNotification(payload) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;

  const title = payload?.notification?.title || payload?.data?.title || "CDK Dispatch";
  const body = payload?.notification?.body || payload?.data?.body || "";
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload?.data || {}
  };

  if (registration?.showNotification) {
    await registration.showNotification(title, options);
    return true;
  }

  new Notification(title, options);
  return true;
}

export async function listenForForegroundNotifications(callback = showForegroundNotification) {
  const messaging = await getSupportedMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
