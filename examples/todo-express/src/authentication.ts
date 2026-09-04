import { ServerResponse, type IncomingMessage } from 'node:http';

import type { Principal } from '@ontahi/core/runtime/server';
import type { Express, Request, RequestHandler, Response } from 'express';
import session from 'express-session';
import { Passport } from 'passport';
import { Strategy as GitHubStrategy, type Profile } from 'passport-github2';

import { todoAuthenticationMode, type TodoAuthenticationMode } from './authentication-mode.js';

export type TodoAuthenticatedUser = {
  subject: string;
  username?: string;
  displayName?: string;
};

type AuthenticatedRequest = Request & {
  user?: TodoAuthenticatedUser;
};

export type TodoAuthenticationAdapter = {
  mode: TodoAuthenticationMode;
  mount(server: Express): void;
  principal(request: Request): Principal | null;
  webSocketPrincipal(request: IncomingMessage): Principal | null | Promise<Principal | null>;
};

export type TodoPassportAuthenticationOptions = {
  github: {
    authorizationUrl?: string;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    tokenUrl?: string;
    userProfileUrl?: string;
  };
  sessionSecret: string;
};

const githubUser = (profile: Profile): TodoAuthenticatedUser => ({
  subject: profile.id,
  username: profile.username,
  displayName: profile.displayName,
});

export const todoPrincipal = (user: TodoAuthenticatedUser): Principal => ({
  subject: user.subject,
  kind: 'user',
  issuer: 'https://github.com',
});

const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when TODO_AUTH_MODE=github.`);
  return value;
};

const configuredGithub = (): TodoPassportAuthenticationOptions => ({
  github: {
    clientId: requiredEnvironmentVariable('TODO_GITHUB_CLIENT_ID'),
    clientSecret: requiredEnvironmentVariable('TODO_GITHUB_CLIENT_SECRET'),
    callbackUrl:
      process.env.TODO_GITHUB_CALLBACK_URL ??
      `http://localhost:${process.env.PORT ?? '3001'}/auth/github/callback`,
  },
  sessionSecret: requiredEnvironmentVariable('TODO_SESSION_SECRET'),
});

export const createDisabledTodoAuthentication = (): TodoAuthenticationAdapter => ({
  mode: 'disabled',
  mount: server => {
    server.get('/auth/session', (_request, response) =>
      response.json({
        mode: 'disabled',
        authenticated: false,
      }),
    );
  },
  principal: () => null,
  webSocketPrincipal: () => null,
});

const runUpgradeMiddleware = (
  middleware: RequestHandler,
  request: IncomingMessage,
  response: ServerResponse,
) =>
  new Promise<void>((resolve, reject) =>
    middleware(request as Request, response as unknown as Response, error =>
      error ? reject(error) : resolve(),
    ),
  );

export const createTodoPassportAuthentication = (
  options: TodoPassportAuthenticationOptions,
): TodoAuthenticationAdapter => {
  const { github } = options;
  const passport = new Passport();
  const sessionMiddleware = session({
    secret: options.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });
  const initializePassport = passport.initialize();
  const restorePassportSession = passport.session();

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: TodoAuthenticatedUser, done) => done(null, user));

  passport.use(
    new GitHubStrategy(
      {
        authorizationURL: github.authorizationUrl,
        clientID: github.clientId,
        clientSecret: github.clientSecret,
        callbackURL: github.callbackUrl,
        // @ts-expect-error passport-github2 narrows the passport-oauth2 boolean option to string.
        state: true,
        tokenURL: github.tokenUrl,
        userProfileURL: github.userProfileUrl,
      },
      (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (error: Error | null, user?: TodoAuthenticatedUser | false) => void,
      ) => done(null, githubUser(profile)),
    ),
  );

  return {
    mode: 'github',
    mount: server => {
      server.use(sessionMiddleware);
      server.use(initializePassport);
      server.use(restorePassportSession);

      server.get('/auth/session', (request, response) => {
        const user = (request as AuthenticatedRequest).user;

        response.json({
          mode: 'github',
          authenticated: Boolean(user),
          ...(user
            ? {
                principal: todoPrincipal(user),
                profile: {
                  username: user.username,
                  displayName: user.displayName,
                },
              }
            : {}),
        });
      });

      server.post('/auth/logout', (request, response, next) => {
        request.logout(error => {
          if (error) {
            next(error);
            return;
          }

          response.status(204).end();
        });
      });

      server.get('/auth/github', passport.authenticate('github'));
      server.get(
        '/auth/github/callback',
        passport.authenticate('github', { failureRedirect: '/?auth=failed' }),
        (_request, response) => response.redirect('/'),
      );
    },
    principal: request => {
      const user = (request as AuthenticatedRequest).user;
      return user ? todoPrincipal(user) : null;
    },
    webSocketPrincipal: async request => {
      const response = new ServerResponse(request);
      await runUpgradeMiddleware(sessionMiddleware, request, response);
      await runUpgradeMiddleware(initializePassport, request, response);
      await runUpgradeMiddleware(restorePassportSession, request, response);
      const user = (request as IncomingMessage & { user?: TodoAuthenticatedUser }).user;
      return user ? todoPrincipal(user) : null;
    },
  };
};

export const createTodoAuthentication = (): TodoAuthenticationAdapter =>
  todoAuthenticationMode === 'github'
    ? createTodoPassportAuthentication(configuredGithub())
    : createDisabledTodoAuthentication();
