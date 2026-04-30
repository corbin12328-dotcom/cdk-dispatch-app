self.importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
self.importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBLjKsfI-kyGpnBag3a2yPZg2Ud5JIQ62U",
  authDomain: "dispatch-71eba.firebaseapp.com",
  projectId: "dispatch-71eba",
  storageBucket: "dispatch-71eba.firebasestorage.app",
  messagingSenderId: "432023169419",
  appId: "1:432023169419:web:9f4b36f20ee3c980ce278e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "CDK Dispatch";
  const options = {
    body: payload.notification?.body || payload.data?.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});
