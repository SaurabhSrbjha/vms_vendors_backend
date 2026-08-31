import admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseInitialized = false;

try {
  let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : path.join(__dirname, "firebase-service-account.json");

  if (!fs.existsSync(serviceAccountPath)) {
    serviceAccountPath = path.join(__dirname, "firebase-service-account.json");
  }

  console.log(`📁 Loading Firebase Service Account from: ${serviceAccountPath}`);

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

    if (serviceAccount.private_key && typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key = serviceAccount.private_key
        .replace(/\\n/g, "\n")
        .replace(/\\\\n/g, "\n");
    }

    const apps = admin.apps || admin.getApps?.() || [];
    let appInstance = apps.length ? apps[0] : null;
    if (!appInstance) {
      const certFunc = admin.credential?.cert || admin.cert;
      appInstance = admin.initializeApp({
        credential: certFunc(serviceAccount),
      });
    }
    firebaseInitialized = true;
    console.log(`🔥 Firebase Admin SDK initialized for project '${serviceAccount.project_id || "UNKNOWN"}' (${serviceAccount.client_email || ""}).`);

    // Verify Google OAuth Token on startup
    if (appInstance && appInstance.options && appInstance.options.credential) {
      appInstance.options.credential.getAccessToken()
        .then(tok => {
          console.log(`✅ Firebase Google OAuth Token Verified! (Expires in ${tok.expires_in || 3600}s)`);
        })
        .catch(err => {
          console.error(`❌ Firebase Google OAuth Token Failed! Error: ${err.message}`);
          console.error(`⏰ Server System Time: ${new Date().toISOString()} (${new Date().toLocaleString()})`);
          console.error(`📌 Project ID: '${serviceAccount.project_id}', Client Email: '${serviceAccount.client_email}'`);
        });
    }
  } else {
    console.warn(
      `⚠️ Firebase service account file not found at: ${serviceAccountPath}. Push notifications will be disabled until valid key is placed.`
    );
  }
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin SDK:", error.message);
}

const getMessagingInstance = () => {
  try {
    if (typeof getMessaging === "function") {
      return getMessaging();
    }
    if (admin && typeof admin.messaging === "function") {
      return admin.messaging();
    }
  } catch (err) {
    console.error("⚠️ Error getting FCM messaging instance:", err?.message || err);
  }
  return null;
};

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
    const msgInstance = getMessagingInstance();
    if (!msgInstance) {
      console.error("❌ Error: Firebase messaging instance is null");
      return false;
    }
    const response = await msgInstance.send(message);
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
    const msgInstance = getMessagingInstance();
    if (!msgInstance) {
      console.error("❌ Error: Firebase messaging instance is null");
      return false;
    }
    await msgInstance.send(message);
    return true;
  } catch (error) {
    console.error("❌ Error sending FCM status notification:", error.message);
    return false;
  }
};

export default admin;
