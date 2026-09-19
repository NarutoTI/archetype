import passport from 'passport';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
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

/**
 * Client ID **web** do Google, ou `null` quando não configurado.
 *
 * O seletor nativo só precisa dele — secret e callback são do Custom Tab. Exportado para
 * o controller responder `OAUTH_NOT_CONFIGURED` antes de tentar verificar qualquer coisa.
 */
export function getGoogleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID || null;
}

let googleIdTokenClient: OAuth2Client | null = null;

/**
 * Verifica o ID token devolvido pelo seletor nativo do Google (Credential Manager no
 * Android) e entrega o payload já validado.
 *
 * A `google-auth-library` confere assinatura, emissor e expiração; o `audience` é o
 * `GOOGLE_CLIENT_ID` — o mesmo client web que o app passa como `webClientId` ao plugin
 * (`VITE_GOOGLE_WEB_CLIENT_ID`). Divergir os dois é o erro silencioso clássico: o token é
 * legítimo e mesmo assim é recusado por audiência.
 *
 * O `email_verified` **não** é conferido aqui: quem decide o que fazer com um e-mail não
 * atestado é o controller, junto da criação da conta.
 *
 * @param idToken JWT do Google vindo do app
 * @returns payload validado, ou `null` se o token não prestar
 */
export async function verifyGoogleIdToken(idToken: string): Promise<TokenPayload | null> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    logger.warn('Google ID token verification skipped: no client ID configured');
    return null;
  }

  try {
    googleIdTokenClient ??= new OAuth2Client(clientId);
    const ticket = await googleIdTokenClient.verifyIdToken({ idToken, audience: clientId });
    return ticket.getPayload() ?? null;
  } catch (error) {
    logger.warn('Google ID token rejected: %s', getErrorMessage(error));
    return null;
  }
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
