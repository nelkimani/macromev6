/* Macrome cloud settings.
   Leave apiKey empty and Macrome runs exactly as before: one device, accounts and data stored on that device.
   To switch on the shared cloud mode, paste your Firebase web-app config below (Firebase console ->
   Project settings -> Your apps -> Web app -> "Config"). See firebase/SETUP.md for the full steps.
   These values are not secrets: the security rules (firebase/firestore.rules) are what protect the data. */
window.MACROME_CLOUD = {
  firebase: {
    apiKey: 'AIzaSyBzl9zNWauo8XjwGB5hzD4vJ1oe0MXZTDY',
    authDomain: 'macrom-pos.firebaseapp.com',
    projectId: 'macrom-pos',
    storageBucket: 'macrom-pos.firebasestorage.app',
    messagingSenderId: '750244028439',
    appId: '1:750244028439:web:5c40ab88b27b33dc5d7c52'
  },
  // Staff type a username; behind the scenes it becomes  username@emailDomain  (never used to send mail).
  emailDomain: 'macrome.app'
};
