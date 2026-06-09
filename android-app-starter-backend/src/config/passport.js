import passport from 'passport';
import jwt from 'jsonwebtoken';
import logger from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'android-app-starter-dev-secret-change-me';

let googleOAuthEnabled = false;
let googleStrategyConfigured = false;

function loadGoogleOAuthConfig() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;

  return {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  };
}

async function configureGoogleOAuth() {
  if (googleStrategyConfigured) return googleOAuthEnabled;

  try {
    const oauthConfig = loadGoogleOAuthConfig();
    if (!oauthConfig?.clientID || !oauthConfig?.clientSecret || !oauthConfig?.callbackURL) {
      googleOAuthEnabled = false;
      googleStrategyConfigured = true;
      logger.warn('Google OAuth not configured');
      return false;
    }

    const { Strategy: GoogleStrategy } = await import('passport-google-oauth20');
    passport.use(new GoogleStrategy({
      clientID: oauthConfig.clientID,
      clientSecret: oauthConfig.clientSecret,
      callbackURL: oauthConfig.callbackURL,
      scope: ['profile', 'email']
    }, async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
          picture: profile.photos?.[0]?.value,
          provider: 'google'
        };
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));

    googleOAuthEnabled = true;
    googleStrategyConfigured = true;
    logger.info('Google OAuth strategy configured with callback URL: %s', oauthConfig.callbackURL);
    return true;
  } catch (error) {
    logger.warn('Google OAuth not configured: %s', error.message);
    googleOAuthEnabled = false;
    googleStrategyConfigured = true;
    return false;
  }
}

export async function isGoogleOAuthEnabled() {
  if (!googleStrategyConfigured) {
    await configureGoogleOAuth();
  }
  return googleOAuthEnabled;
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

export const generateJWT = (user, expiresIn = '7d') => {
  const payload = {
    id: user.id || user._id?.toString(),
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    tokenType: user.tokenType,
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

export const verifyJWT = (token) => jwt.verify(token, JWT_SECRET);

export default passport;
