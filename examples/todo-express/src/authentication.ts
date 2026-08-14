import { randomBytes } from 'node:crypto';

import type { Principal } from '@ontahi/core/runtime/server';
import type { Express, Request } from 'express';
import session from 'express-session';
import { Passport } from 'passport';
import { Strategy as GitHubStrategy, type Profile } from 'passport-github2';

export type TodoAuthenticatedUser = {
  subject: string;
  username?: string;
  displayName?: string;
};

type AuthenticatedRequest = Request & {
  user?: TodoAuthenticatedUser;
};

export type TodoAuthenticationAdapter = {
  mount(server: Express): void;
  principal(request: Request): Principal | null;
};

export type TodoPassportAuthenticationOptions = {
  github?: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  sessionSecret?: string;
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

const configuredGithub = (): TodoPassportAuthenticationOptions['github'] | undefined => {
  const clientId = process.env.TODO_GITHUB_CLIENT_ID;
  const clientSecret = process.env.TODO_GITHUB_CLIENT_SECRET;

  return clientId && clientSecret
    ? {
        clientId,
        clientSecret,
        callbackUrl:
          process.env.TODO_GITHUB_CALLBACK_URL ??
          `http://localhost:${process.env.PORT ?? '3001'}/auth/github/callback`,
      }
    : undefined;
};

export const createTodoPassportAuthentication = (
  options: TodoPassportAuthenticationOptions = {},
): TodoAuthenticationAdapter => {
  const github = options.github ?? configuredGithub();
  const passport = new Passport();

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: TodoAuthenticatedUser, done) => done(null, user));

  if (github) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: github.clientId,
          clientSecret: github.clientSecret,
          callbackURL: github.callbackUrl,
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: Profile,
          done: (error: Error | null, user?: TodoAuthenticatedUser | false) => void,
        ) => done(null, githubUser(profile)),
      ),
    );
  }

  return {
    mount: server => {
      server.use(
        session({
          secret:
            options.sessionSecret ??
            process.env.TODO_SESSION_SECRET ??
            randomBytes(32).toString('hex'),
          resave: false,
          saveUninitialized: false,
          cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          },
        }),
      );
      server.use(passport.initialize());
      server.use(passport.session());

      server.get('/auth/session', (request, response) => {
        const user = (request as AuthenticatedRequest).user;

        response.json({
          authenticated: Boolean(user),
          providerConfigured: Boolean(github),
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

      if (github) {
        server.get('/auth/github', passport.authenticate('github'));
        server.get(
          '/auth/github/callback',
          passport.authenticate('github', { failureRedirect: '/?auth=failed' }),
          (_request, response) => response.redirect('/'),
        );
      } else {
        server.get('/auth/github', (_request, response) =>
          response.status(503).json({
            error: 'GitHub OAuth is not configured for this Todo host.',
          }),
        );
      }
    },
    principal: request => {
      const user = (request as AuthenticatedRequest).user;
      return user ? todoPrincipal(user) : null;
    },
  };
};
