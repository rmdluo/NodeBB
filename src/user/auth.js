"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const winston_1 = __importDefault(require("winston"));
const validator_1 = __importDefault(require("validator"));
const util_1 = __importDefault(require("util"));
const lodash_1 = __importDefault(require("lodash"));
const database_1 = __importDefault(require("../database"));
const meta_1 = __importDefault(require("../meta"));
const events_1 = __importDefault(require("../events"));
const batch_1 = __importDefault(require("../batch"));
const utils_1 = __importDefault(require("../utils"));
module.exports = function (User) {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth = {};
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.logAttempt = function (uid, ip) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(parseInt(uid, 10) > 0)) {
                return;
            }
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const exists = yield database_1.default.exists(`lockout:${uid}`);
            if (exists) {
                throw new Error('[[error:account-locked]]');
            }
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const attempts = yield database_1.default.increment(`loginAttempts:${uid}`);
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (attempts <= meta_1.default.config.loginAttempts) {
                // The next line calls a function in a module that has not been updated to TS yet
                /* eslint-disable-next-line
                    @typescript-eslint/no-unsafe-member-access,
                    @typescript-eslint/no-unsafe-call,
                    @typescript-eslint/no-unsafe-return
                */
                return yield database_1.default.pexpire(`loginAttempts:${uid}`, 1000 * 60 * 60);
            }
            // Lock out the account
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.set(`lockout:${uid}`, '');
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const duration = 1000 * 60 * meta_1.default.config.lockoutDuration;
            // The next lines call a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.delete(`loginAttempts:${uid}`);
            // The next lines call a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.pexpire(`lockout:${uid}`, duration);
            yield events_1.default.log({
                type: 'account-locked',
                uid: uid,
                ip: ip,
            });
            throw new Error('[[error:account-locked]]');
        });
    };
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.getFeedToken = function (uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(parseInt(uid, 10) > 0)) {
                return;
            }
            // The next lines call a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const _token = yield database_1.default.getObjectField(`user:${uid}`, 'rss_token');
            // The next lines call a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            const token = _token || utils_1.default.generateUUID();
            if (!_token) {
                // The next lines call a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield User.setUserField(uid, 'rss_token', token);
            }
            return token;
        });
    };
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.clearLoginAttempts = function (uid) {
        return __awaiter(this, void 0, void 0, function* () {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.delete(`loginAttempts:${uid}`);
        });
    };
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.resetLockout = function (uid) {
        return __awaiter(this, void 0, void 0, function* () {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.deleteAll([
                `loginAttempts:${uid}`,
                `lockout:${uid}`,
            ]);
        });
    };
    const getSessionFromStore = util_1.default.promisify((sid, callback) => database_1.default.sessionStore.get(sid, (err, sessObj) => callback(err, sessObj || null)));
    const sessionStoreDestroy = util_1.default.promisify((sid, callback) => database_1.default.sessionStore.destroy(sid, err => callback(err)));
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.getSessions = function (uid, curSessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield cleanExpiredSessions(uid);
            const sids = yield database_1.default.getSortedSetRevRange(`uid:${uid}:sessions`, 0, 19);
            let sessions = yield Promise.all(sids.map(sid => getSessionFromStore(sid)));
            sessions = sessions.map((sessObj, idx) => {
                if (sessObj && sessObj.meta) {
                    sessObj.meta.current = curSessionId === sids[idx];
                    sessObj.meta.datetimeISO = new Date(sessObj.meta.datetime).toISOString();
                    sessObj.meta.ip = validator_1.default.escape(String(sessObj.meta.ip));
                }
                return sessObj && sessObj.meta;
            }).filter(Boolean);
            return sessions;
        });
    };
    function cleanExpiredSessions(uid) {
        return __awaiter(this, void 0, void 0, function* () {
            const uuidMapping = yield database_1.default.getObject(`uid:${uid}:sessionUUID:sessionId`);
            if (!uuidMapping) {
                return;
            }
            const expiredUUIDs = [];
            const expiredSids = [];
            yield Promise.all(Object.keys(uuidMapping).map((uuid) => __awaiter(this, void 0, void 0, function* () {
                const sid = uuidMapping[uuid];
                const sessionObj = yield getSessionFromStore(sid);
                const expired = !sessionObj || !sessionObj.hasOwnProperty('passport') ||
                    !sessionObj.passport.hasOwnProperty('user') ||
                    parseInt(sessionObj.passport.user, 10) !== parseInt(uid, 10);
                if (expired) {
                    expiredUUIDs.push(uuid);
                    expiredSids.push(sid);
                }
            })));
            yield database_1.default.deleteObjectFields(`uid:${uid}:sessionUUID:sessionId`, expiredUUIDs);
            yield database_1.default.sortedSetRemove(`uid:${uid}:sessions`, expiredSids);
        });
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.addSession = function (uid, sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(parseInt(uid, 10) > 0)) {
                return;
            }
            yield cleanExpiredSessions(uid);
            yield database_1.default.sortedSetAdd(`uid:${uid}:sessions`, Date.now(), sessionId);
            yield revokeSessionsAboveThreshold(uid, meta_1.default.config.maxUserSessions);
        });
    };
    function revokeSessionsAboveThreshold(uid, maxUserSessions) {
        return __awaiter(this, void 0, void 0, function* () {
            const activeSessions = yield database_1.default.getSortedSetRange(`uid:${uid}:sessions`, 0, -1);
            if (activeSessions.length > maxUserSessions) {
                const sessionsToRevoke = activeSessions.slice(0, activeSessions.length - maxUserSessions);
                yield Promise.all(sessionsToRevoke.map(sessionId => User.auth.revokeSession(sessionId, uid)));
            }
        });
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.revokeSession = function (sessionId, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            winston_1.default.verbose(`[user.auth] Revoking session ${sessionId} for user ${uid}`);
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sessionObj = yield getSessionFromStore(sessionId);
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (sessionObj && sessionObj.meta && sessionObj.meta.uuid) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield database_1.default.deleteObjectField(`uid:${uid}:sessionUUID:sessionId`, sessionObj.meta.uuid);
            }
            yield Promise.all([
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                database_1.default.sortedSetRemove(`uid:${uid}:sessions`, sessionId),
                sessionStoreDestroy(sessionId),
            ]);
        });
    };
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.revokeAllSessions = function (uids, except) {
        return __awaiter(this, void 0, void 0, function* () {
            uids = Array.isArray(uids) ? uids : [uids];
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const sids = yield database_1.default.getSortedSetsMembers(uids.map(uid => `uid:${uid}:sessions`));
            const promises = [];
            uids.forEach((uid, index) => {
                const ids = sids[index].filter(id => id !== except);
                if (ids.length) {
                    // The next line calls a function in a module that has not been updated to TS yet
                    /* eslint-disable-next-line
                        @typescript-eslint/no-unsafe-member-access,
                        @typescript-eslint/no-unsafe-call
                    */
                    promises.push(ids.map(s => User.auth.revokeSession(s, uid)));
                }
            });
            yield Promise.all(promises);
        });
    };
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    User.auth.deleteAllSessions = function () {
        return __awaiter(this, void 0, void 0, function* () {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            yield batch_1.default.processSortedSet('users:joindate', (uids) => __awaiter(this, void 0, void 0, function* () {
                const sessionKeys = uids.map(uid => `uid:${uid}:sessions`);
                const sessionUUIDKeys = uids.map(uid => `uid:${uid}:sessionUUID:sessionId`);
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                const sids = lodash_1.default.flatten(yield database_1.default.getSortedSetRange(sessionKeys, 0, -1));
                yield Promise.all([
                    // The next line calls a function in a module that has not been updated to TS yet
                    /* eslint-disable-next-line
                        @typescript-eslint/no-unsafe-member-access,
                        @typescript-eslint/no-unsafe-call
                    */
                    database_1.default.deleteAll(sessionKeys.concat(sessionUUIDKeys)),
                    ...sids.map(sid => sessionStoreDestroy(sid)),
                ]);
            }), { batch: 1000 });
        });
    };
};
