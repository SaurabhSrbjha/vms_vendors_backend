import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

let firebaseInitialized = false;

try {
  const serviceAccountPath = path.resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./src/config/firebase-service-account.json"
  );

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    firebaseInitialized = true;
    console.log("🔥 Firebase Admin SDK initialized successfully.");
  } else {
    console.warn(
      `⚠️ Firebase service account file not found at: ${serviceAccountPath}. Push notifications will be disabled until valid key is placed.`
    );
  }
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin SDK:", error.message);
}

/**
 * Send FCM Push Notification to Host Employee when Visitor arrives
 */
export const sendVisitorArrivalNotification = async (fcmToken, visitorData) => {
  if (!firebaseInitialized) {
    console.warn("⚠️ Firebase not initialized. Skipping notification.");
    return false;
  }

  if (!fcmToken) {
    console.warn("⚠️ Host employee has no FCM Token registered. Notification skipped.");
    return false;
  }

  const message = {
    token: fcmToken,
    notification: {
      title: "🔔 New Visitor Arrived!",
      body: `${visitorData.full_name || "A visitor"} has arrived at reception for ${visitorData.purpose || "meeting"}.`,
    },
    data: {
      type: "VISITOR_ARRIVAL",
      visitor_id: String(visitorData.visitor_id || visitorData.id || ""),
      full_name: String(visitorData.full_name || ""),
      mobile: String(visitorData.mobile || ""),
      purpose: String(visitorData.purpose || ""),
      photo: String(visitorData.photo || ""),
      host_employee_id: String(visitorData.host_employee_id || ""),
      created_at: String(visitorData.created_at || new Date().toISOString()),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "vms_visitor_alerts",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`✅ Visitor arrival FCM notification sent successfully to token ${fcmToken.slice(0, 10)}... MessageId:`, response);
    return true;
  } catch (error) {
    console.error("❌ Error sending FCM notification:", error.message);
    return false;
  }
};

/**
 * Send FCM Push Notification on visitor status update
 */
export const sendVisitorStatusNotification = async (fcmToken, visitorData, status) => {
  if (!firebaseInitialized || !fcmToken) return false;

  const statusText = status.toUpperCase();
  const title = statusText === "APPROVED" ? "✅ Visitor Approved" : statusText === "REJECTED" ? "❌ Visitor Rejected" : "ℹ️ Visitor Status Update";

  const message = {
    token: fcmToken,
    notification: {
      title,
      body: `Visitor ${visitorData.full_name} (${visitorData.visitor_id}) has been ${statusText.toLowerCase()}.`,
    },
    data: {
      type: "VISITOR_STATUS_UPDATE",
      visitor_id: String(visitorData.visitor_id || visitorData.id || ""),
      status: statusText,
      full_name: String(visitorData.full_name || ""),
    },
  };

  try {
    await admin.messaging().send(message);
    return true;
  } catch (error) {
    console.error("❌ Error sending FCM status notification:", error.message);
    return false;
  }
};

export default admin;
