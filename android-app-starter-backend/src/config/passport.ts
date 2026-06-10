import passport from 'passport';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import logger from './logger.js';
import type { AppUser, JwtUserPayload } from '../types/schemas.js';

const JWT_SECRET = process.env.JWT_SECRET || 'android-app-starter-dev-secret-change-me';

let googleOAuthEnabled = false;
let googleStrategyConfigured = false;

interface GoogleOAuthConfig {
  clientID: string;
  clientSecret: string;
  callbackURL?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadGoogleOAuthConfig(): GoogleOAuthConfig | null {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;

  return {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  };
}

async function configureGoogleOAuth(): Promise<boolean> {
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
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Google profile email is required'), false);
        }

        const user: AppUser = {
          id: profile.id,
          email,
          name: profile.displayName || email,
          picture: profile.photos?.[0]?.value,
          provider: 'google'
        };
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }));

    googleOAuthEnabled = true;
    googleStrategyConfigured = true;
    logger.info('Google OAuth strategy configured with callback URL: %s', oauthConfig.callbackURL);
    return true;
  } catch (error) {
    logger.warn('Google OAuth not configured: %s', getErrorMessage(error));
    googleOAuthEnabled = false;
    googleStrategyConfigured = true;
    return false;
  }
}

export async function isGoogleOAuthEnabled(): Promise<boolean> {
  if (!googleStrategyConfigured) {
    await configureGoogleOAuth();
  }
  return googleOAuthEnabled;
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user: Express.User, done) => done(null, user));

export const generateJWT = (user: Partial<AppUser>, expiresIn: SignOptions['expiresIn'] = '7d'): string => {
  if (!user.email) {
    throw new Error('User email is required to generate JWT');
  }

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

export const verifyJWT = (token: string): JwtUserPayload => {
  const payload = jwt.verify(token, JWT_SECRET);
  if (typeof payload === 'string') {
    throw new Error('Invalid JWT payload');
  }
  return payload as JwtUserPayload;
};

export default passport;
