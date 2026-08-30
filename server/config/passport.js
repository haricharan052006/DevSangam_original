const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Identity verification only — no DB access here. What happens with a
// verified Google profile (sign in / link an existing account / recover a
// password) depends on the `state` query param (login vs recover) set when
// the flow is kicked off, and is handled entirely in the /google/callback
// route handler. That keeps this strategy dumb and reusable, and keeps all
// user-table logic in one place (routes/auth.js) alongside the rest of auth.
//
// No serializeUser/deserializeUser: every passport.authenticate() call in
// this app passes { session: false } — auth stays JWT-only, matching the
// rest of the app, so passport never needs a session to (de)serialize into.
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      done(null, profile);
    }
  )
);

module.exports = passport;
