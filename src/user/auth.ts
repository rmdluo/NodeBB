import winston from 'winston';
import validator from 'validator';
import util from 'util';
import _ from 'lodash';
import db from '../database';
import meta from '../meta';
import events from '../events';
import batch from '../batch';
import utils from '../utils';

export = function (User) {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth = {};

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.logAttempt = async function (uid : string, ip : string) {
        if (!(parseInt(uid, 10) > 0)) {
            return;
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const exists : boolean = await db.exists(`lockout:${uid}`) as boolean;
        if (exists) {
            throw new Error('[[error:account-locked]]');
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const attempts : number = await db.increment(`loginAttempts:${uid}`) as number;

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (attempts <= (meta.config.loginAttempts as number)) {
            // The next line calls a function in a module that has not been updated to TS yet
            /* eslint-disable-next-line
                @typescript-eslint/no-unsafe-member-access,
                @typescript-eslint/no-unsafe-call,
                @typescript-eslint/no-unsafe-return
            */
            return await db.pexpire(`loginAttempts:${uid}`, 1000 * 60 * 60);
        }
        // Lock out the account
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.set(`lockout:${uid}`, '');

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const duration : number = 1000 * 60 * (meta.config.lockoutDuration as number);

        // The next lines call a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.delete(`loginAttempts:${uid}`);
        // The next lines call a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.pexpire(`lockout:${uid}`, duration);
        await events.log({
            type: 'account-locked',
            uid: uid,
            ip: ip,
        });
        throw new Error('[[error:account-locked]]');
    };

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.getFeedToken = async function (uid : string) {
        if (!(parseInt(uid, 10) > 0)) {
            return;
        }

        // The next lines call a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const _token : string = await db.getObjectField(`user:${uid}`, 'rss_token') as string;
        // The next lines call a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const token : string = _token || (utils.generateUUID() as string);
        if (!_token) {
            // The next lines call a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await User.setUserField(uid, 'rss_token', token);
        }
        return token;
    };

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.clearLoginAttempts = async function (uid : string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.delete(`loginAttempts:${uid}`);
    };

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.resetLockout = async function (uid : string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.deleteAll([
            `loginAttempts:${uid}`,
            `lockout:${uid}`,
        ]);
    };

    const getSessionFromStore = util.promisify(
        (sid, callback) => db.sessionStore.get(sid, (err, sessObj) => callback(err, sessObj || null))
    );
    const sessionStoreDestroy = util.promisify(
        (sid, callback) => db.sessionStore.destroy(sid, err => callback(err))
    );

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.getSessions = async function (uid, curSessionId) {
        await cleanExpiredSessions(uid);
        const sids = await db.getSortedSetRevRange(`uid:${uid}:sessions`, 0, 19);
        let sessions = await Promise.all(sids.map(sid => getSessionFromStore(sid)));
        sessions = sessions.map((sessObj, idx) => {
            if (sessObj && sessObj.meta) {
                sessObj.meta.current = curSessionId === sids[idx];
                sessObj.meta.datetimeISO = new Date(sessObj.meta.datetime).toISOString();
                sessObj.meta.ip = validator.escape(String(sessObj.meta.ip));
            }
            return sessObj && sessObj.meta;
        }).filter(Boolean);
        return sessions;
    };

    async function cleanExpiredSessions(uid) {
        const uuidMapping = await db.getObject(`uid:${uid}:sessionUUID:sessionId`);
        if (!uuidMapping) {
            return;
        }
        const expiredUUIDs = [];
        const expiredSids = [];
        await Promise.all(Object.keys(uuidMapping).map(async (uuid) => {
            const sid = uuidMapping[uuid];
            const sessionObj : any = await getSessionFromStore(sid);
            const expired = !sessionObj || !sessionObj.hasOwnProperty('passport') ||
                !sessionObj.passport.hasOwnProperty('user') ||
                parseInt(sessionObj.passport.user, 10) !== parseInt(uid, 10);
            if (expired) {
                expiredUUIDs.push(uuid);
                expiredSids.push(sid);
            }
        }));
        await db.deleteObjectFields(`uid:${uid}:sessionUUID:sessionId`, expiredUUIDs);
        await db.sortedSetRemove(`uid:${uid}:sessions`, expiredSids);
    }

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.addSession = async function (uid, sessionId) {
        if (!(parseInt(uid, 10) > 0)) {
            return;
        }
        await cleanExpiredSessions(uid);
        await db.sortedSetAdd(`uid:${uid}:sessions`, Date.now(), sessionId);
        await revokeSessionsAboveThreshold(uid, meta.config.maxUserSessions);
    };

    async function revokeSessionsAboveThreshold(uid : string, maxUserSessions : number) {
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line
            @typescript-eslint/no-unsafe-member-access,
            @typescript-eslint/no-unsafe-call
        */
        const activeSessions : Array<string> = await db.getSortedSetRange(`uid:${uid}:sessions`, 0, -1) as Array<string>;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (activeSessions.length > maxUserSessions) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const sessionsToRevoke : Array<string> = activeSessions.slice(0, activeSessions.length - maxUserSessions);
            await Promise.all(sessionsToRevoke.map(
                // The next line calls a function in a module that has not been updated to TS yet
                /* eslint-disable-next-line
                    @typescript-eslint/no-unsafe-member-access,
                    @typescript-eslint/no-unsafe-call
                */
                sessionId => User.auth.revokeSession(sessionId, uid) as Promise<void>
            ));
        }
    }

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.revokeSession = async function (sessionId : string, uid : string) {
        winston.verbose(`[user.auth] Revoking session ${sessionId} for user ${uid}`);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessionObj : any = await getSessionFromStore(sessionId);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (sessionObj && sessionObj.meta && sessionObj.meta.uuid) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await db.deleteObjectField(`uid:${uid}:sessionUUID:sessionId`, sessionObj.meta.uuid);
        }
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.sortedSetRemove(`uid:${uid}:sessions`, sessionId),
            sessionStoreDestroy(sessionId),
        ]);
    };

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.revokeAllSessions = async function (uids : string | Array<string>, except) {
        uids = Array.isArray(uids) ? uids : [uids];
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const sids : Array<Array<string>> = await db.getSortedSetsMembers(uids.map(uid => `uid:${uid}:sessions`)) as Array<Array<string>>;
        const promises = [];
        uids.forEach((uid, index) => {
            const ids = sids[index].filter(id => id !== except);
            if (ids.length) {
                // The next line calls a function in a module that has not been updated to TS yet
                /* eslint-disable-next-line
                    @typescript-eslint/no-unsafe-member-access,
                    @typescript-eslint/no-unsafe-call
                */
                promises.push(ids.map(s => User.auth.revokeSession(s, uid) as Promise<void>));
            }
        });
        await Promise.all(promises);
    };

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.deleteAllSessions = async function () {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        await batch.processSortedSet('users:joindate', async (uids : Array<string>) => {
            const sessionKeys = uids.map(uid => `uid:${uid}:sessions`);
            const sessionUUIDKeys = uids.map(uid => `uid:${uid}:sessionUUID:sessionId`);
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const sids = _.flatten(await db.getSortedSetRange(sessionKeys, 0, -1) as Array<string>);

            await Promise.all([
                // The next line calls a function in a module that has not been updated to TS yet
                /* eslint-disable-next-line
                    @typescript-eslint/no-unsafe-member-access,
                    @typescript-eslint/no-unsafe-call
                */
                db.deleteAll(sessionKeys.concat(sessionUUIDKeys)),
                ...sids.map(sid => sessionStoreDestroy(sid)),
            ]);
        }, { batch: 1000 });
    };
};
