# CDK RO Skill Dispatcher PWA

This is a deployable first version of the shop dispatch app.

## Features
- Dispatcher and tech app screens
- Google sign-in through Firebase Auth
- Firestore shared live database
- CDK RO paste/import
- S-code dispatch: S10, S12, S13, S14, S16, S17, S18, S19
- Random dispatch only to active techs with matching skill
- Tech accept/start/complete workflow
- Final hours after completion
- Tech-to-dispatch messages
- Notification records in Firestore
- PWA manifest so phones can install it to home screen

## Setup
1. Create a Firebase project.
2. Enable Authentication > Google provider.
3. Enable Firestore Database.
4. Copy your Firebase web config into `.env` using `.env.example`.
5. Run:
   npm install
   npm run dev
6. Deploy to Vercel.

## Firebase rules
For testing, use `firestore.rules` included here. For production, tighten rules so dispatcher/tech roles are enforced by user profile.

## Phone app install
After deploying, open the site on a phone browser and choose Add to Home Screen.

## Push notifications
This package stores notification records. True push notifications require Firebase Cloud Messaging setup with a service worker and VAPID key. That is the next production step.
