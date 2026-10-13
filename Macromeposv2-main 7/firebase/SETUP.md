# Macrome cloud mode — Firebase setup (Phase 1)

Do this once. The free Firebase plan (Spark) is enough; no Cloud Functions are used.
If `js/firebase-config.js` is left empty, Macrome keeps working exactly as before (single device, nothing in the cloud).

## 1. Create the Firebase project
1. https://console.firebase.google.com → **Add project** (e.g. `macrome-pos`). Google Analytics can stay off.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave "Email link" off).
3. **Build → Firestore Database → Create database → Production mode.** Pick the region closest to you
   (`africa-south1` Johannesburg if offered, otherwise `europe-west1`). The region cannot be changed later.
4. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app named "Macrome POS".
   Copy the `firebaseConfig` values into `js/firebase-config.js` (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId). These are not secrets.

## 2. Security rules
1. Open `firebase/firestore.rules` and copy it.
2. **Firestore Database → Rules** → paste → find `function setupCode()` and change `CHANGE-THIS-SETUP-CODE` to a code of your
   own (letters/digits/dashes, no slashes). Do this in the console, not in the file you upload.
3. **Publish.** Remember the code: you type it once on first launch.
4. Optional but recommended: **Google Cloud console → APIs & Services → Credentials →** your browser API key →
   *Application restrictions → Websites* → add the address you host Macrome on.

## 3. Libraries and upload
```
python3 tools/vendor.py      # on a computer with internet: also downloads the Firebase libraries into vendor/
python3 tools/stamp.py
```
Upload the whole folder (including `vendor/`) as usual. Tills will show "update available".

## 4. First launch
Open Macrome on the owner's phone/computer **with internet**. It shows *Set up Macrome Electronics*: enter your name, a username,
a password and the setup code. You are now the Super Admin. Add managers and attendants in **Settings → Staff Accounts**
(pick the role and the shop). Attendants and shop managers are locked to their shop by the server rules, not just by the screen.

## Good to know
* **Offline sign-in.** Each person must sign in once **online** on a phone. After that, that same person can sign in offline on that
  phone. Someone else on the same phone needs internet for their first sign-in there.
* **Passwords.** Everyone changes their own in Settings → Change My Password. Resetting *someone else's* password needs a server
  function (paid plan) or the owner re-creating the account; it is planned for Phase 4. Until then use **Switch off** on a lost phone/leaver.
* **Switching off** an account (instead of deleting) blocks all access immediately; the username stays reserved.
* **Existing data.** Sales, stock and expenses are still stored on each device in Phase 1. Do not clear browser data on the
  old till; Phase 5 uploads it into Shop A.
* **Spam sign-ups.** Anyone who has your public API key can create a bare Firebase login, but without a staff record the rules give it
  no access to anything. Restricting the API key to your website (step 2.4) limits this further.
* The rules were written but not run against the Firebase emulator in this phase. Use **Rules → Rules Playground** in the console
  for a quick check, and re-test after each phase.
