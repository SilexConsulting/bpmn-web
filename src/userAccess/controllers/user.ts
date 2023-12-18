const { promisify } = require('util');
const crypto = require('crypto');
const passport = require('passport');
const _ = require('lodash');
const validator = require('validator');
const mailChecker = require('mailchecker');
const User = require('../models/User');

const Mailer = require('../config/mail');
const randomBytesAsync = promisify(crypto.randomBytes);

const viewPath = '../userAccess/views/account/';
export class UserController {
    static admin(req, res) {
        if (!req.user || !req.user.isAdmin) {
            return res.redirect('/');
        }

        User
            .find()
            .then((users) => {
                if (!users) {
                    console.log('no such user');
                }
                else {
                    res.render(viewPath+'admin', { title: 'Admin', users });
                }
            })
            .catch((error) => {
                console.log('Error saving the user profile to the database after email verification', error);
            });
    }
    /**
     * GET /account/edit
     * Edit user Page.
     */
    static getEdit(req, res) {
        if (!req.user.isAdmin) {
            return res.redirect('/');
        }
        console.log('req.params',req.params)
        User
            .findById(req.params.id)
            .then((editUser) => {
                if (!editUser) {
                    console.log('no such user');
                    req.flash('errors', 'no such user');
                    return res.redirect('/admin');
                }
                else {
                    console.log('editUser', editUser);
                    res.render(viewPath+'profile', { title: 'profile', editUser, editGroups: true });
                }
            })
            .catch((error) => {
                console.log('Error saving the user profile to the database after email verification', error);
            });
    }
    /**
     * POST /account/edit
     * Update profile information by admin
     */
    static postEdit(req, res, next) {
        console.log("post edit profile", req.body);
        const validationErrors = [];
        if (!validator.isEmail(req.body.email))
            validationErrors.push({ msg: 'Please enter a valid email address.' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect(viewPath + '/edit/' + req.body.id);
        }
        req.body.email = validator.normalizeEmail(req.body.email, { gmail_remove_dots: false });
        User.findById(req.body.id, (err, user) => {
            if (err) {
                return next(err);
            }
            if (user.email !== req.body.email)
                user.emailVerified = false;
            user.email = req.body.email || '';
            user.userGroups = req.body.userGroups;
            user.profile.name = req.body.name || '';
            user.profile.gender = req.body.gender || '';
            user.profile.location = req.body.location || '';
            user.profile.website = req.body.website || '';
            console.log('user obj', user);
            user.save((err) => {
                if (err) {
                    if (err.code === 11000) {
                        req.flash('errors', { msg: 'The email address you have entered is already associated with an account.' });
                        return res.redirect(viewPath + 'edit/' + req.body.id);
                    }
                    return next(err);
                }
                req.flash('success', { msg: 'Profile information has been updated.' });
                return res.redirect(viewPath + 'edit/' + req.body.id);
            });
        });
    }
    /**
     * GET /login
     * Login page.
     */
    static getLogin(req, res) {
        if (req.user) {
            return res.redirect('/');
        }
        res.render(viewPath + 'login', {
            title: 'Login'
        });
    }
    /**
     * POST /login
     * Sign in using email and password.
     */
    static postLogin(req, res, next) {
        console.log("postLogin", req.body.userid, req.body.password);
        const validationErrors = [];
        if (validator.isEmpty(req.body.userName))
            validationErrors.push({ msg: 'Password cannot be blank.' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect('/login');
        }
        //req.body.email = validator.normalizeEmail(req.body.email, { gmail_remove_dots: false });
        passport.authenticate('local', (err, user, info) => {
            if (err) {
                return next(err);
            }
            if (!user) {
                console.log('authenticate Info', info);
                req.flash('errors', info);
                return res.redirect('/login');
            }
            req.logIn(user, (err) => {
                if (err) {
                    return next(err);
                }
                req.flash('success', { msg: 'Success! You are logged in.' });
                res.redirect(req.session.returnTo || '/');
            });
        })(req, res, next);
    }
    /**
     * GET /logout
     * Log out.
     */
    static logout(req, res, next) {
        req.session.destroy((err) => {
            if (err)
                console.log('Error : Failed to destroy the session during logout.', err);
            req.user = null;
            res.redirect('/');
            next();
        });
        /*
        req.logout(function (err) {
            if (err) { return next(err); }
            res.redirect('/');
        }); */
    }
    /**
     * GET /signup
     * Signup page.
     */
    static getSignup(req, res) {
        if (req.user) {
            return res.redirect('/');
        }
        res.render(viewPath + 'signup', {
            title: 'Create Account'
        });
    }
    /**
     * POST /signup
     * Create a new local account.
     */
    static postSignup(req, res, next) {
        console.log('postSignup');
        const validationErrors = [];
        if (!validator.isEmail(req.body.email))
            validationErrors.push({ msg: 'Please enter a valid email address.' });
        if (!validator.isLength(req.body.password, { min: 8 }))
            validationErrors.push({ msg: 'Password must be at least 8 characters long' });
        if (req.body.password !== req.body.confirmPassword)
            validationErrors.push({ msg: 'Passwords do not match' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect('/signup');
        }
        req.body.email = validator.normalizeEmail(req.body.email, { gmail_remove_dots: false });
        const user = new User({
            userName: req.body.userName,
            email: req.body.email,
            password: req.body.password
        });
        User.findOne({ userName: req.body.userName }, (err, existingUser) => {
            if (err) {
                return next(err);
            }
            if (existingUser) {
                req.flash('errors', { msg: 'Account with that userName already exists.' });
                console.log('already exists');
                return res.redirect('/signup');
            }
        });
        User.findOne({ email: req.body.email }, (err, existingUser) => {
            if (err) {
                return next(err);
            }
            if (existingUser) {
                req.flash('errors', { msg: 'Account with that email address already exists.' });
                console.log('already exists');
                return res.redirect('/signup');
            }
            user.save((err) => {
                if (err) {
                    return next(err);
                }
                req.logIn(user, (err) => {
                    if (err) {
                        return next(err);
                    }
                    res.redirect('/');
                });
            });
        });
    }
    /**
     * GET /account
     * Profile page.
     */
    static getAccount(req, res) {
        res.render(viewPath + 'profile', {
            editUser: req.user, editGroups: false,
            title: 'Account Management'
        });
    }
    /**
     * POST /account/profile
     * Update profile information.
     */
    static postUpdateProfile(req, res, next) {
        console.log("post update profile", req.body,req.user);
        const validationErrors = [];
        if (!validator.isEmail(req.body.email))
            validationErrors.push({ msg: 'Please enter a valid email address.' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect('/account/edit/'+req.body.id);
        }
        req.body.email = validator.normalizeEmail(req.body.email, { gmail_remove_dots: false });
        User.findById(req.body.id, (err, user) => {
            if (err) {
                return next(err);
            }
            if (user.email !== req.body.email)
                user.emailVerified = false;
            user.userGroups = req.body.userGroups.split(',');
            user.email = req.body.email || '';
            user.profile.name = req.body.name || '';
            user.profile.gender = req.body.gender || '';
            user.profile.location = req.body.location || '';
            user.profile.website = req.body.website || '';
           
            user.save((err) => {
                if (err) {
                    if (err.code === 11000) {
                        req.flash('errors', { msg: 'The email address you have entered is already associated with an account.' });
                        return res.redirect('/account/edit' + req.body.id);
                    }
                    return next(err);
                }
                req.flash('success', { msg: 'Profile information has been updated.' });
                res.redirect('/account/edit/' + req.body.id);
            });
        });
    }
    /**
     * POST /account/password
     * Update current password.
     */
    static postUpdatePassword(req, res, next) {
        const validationErrors = [];
        if (!validator.isLength(req.body.password, { min: 8 }))
            validationErrors.push({ msg: 'Password must be at least 8 characters long' });
        if (req.body.password !== req.body.confirmPassword)
            validationErrors.push({ msg: 'Passwords do not match' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            res.redirect('/account/edit/' + req.body.id);
        }
        console.log('changing pw for ' + req.body.id);
        User.findById(req.body.id, (err, user) => {
            if (err) {
                return next(err);
            }
            user.password = req.body.password;
            user.save((err) => {
                if (err) {
                    return next(err);
                }
                req.flash('success', { msg: 'Password has been changed for user '+user.userName+'.' });
                res.redirect('/account/edit/' + user.id);
            });
        });
    }
    /**
     * POST /account/delete
     * Delete user account.
     */
    static postDeleteAccount(req, res, next) {
        User.deleteOne({ _id: req.body.id }, (err) => {
            if (err) {
                return next(err);
            }
            if (req.user.id == req.body.id) {
                req.logout();
                req.flash('info', { msg: 'Account has been deleted for user' + req.body.id + '.' });
                res.redirect('/');
            }
            else {

                req.flash('info', { msg: 'Account has been deleted for user' + req.body.id + '.' });
                res.redirect('/admin');

            }
        });
    }
    /**
     * GET /account/unlink/:provider
     * Unlink OAuth provider.
     */
    static getOauthUnlink(req, res, next) {
        const { provider } = req.params;
        User.findById(req.user.id, (err, user) => {
            if (err) {
                return next(err);
            }
            user[provider.toLowerCase()] = undefined;
            const tokensWithoutProviderToUnlink = user.tokens.filter((token) => token.kind !== provider.toLowerCase());
            // Some auth providers do not provide an email address in the user profile.
            // As a result, we need to verify that unlinking the provider is safe by ensuring
            // that another login method exists.
            if (!(user.email && user.password)
                && tokensWithoutProviderToUnlink.length === 0) {
                req.flash('errors', {
                    msg: `The ${_.startCase(_.toLower(provider))} account cannot be unlinked without another form of login enabled.`
                        + ' Please link another account or add an email address and password.'
                });
                return res.redirect('/account');
            }
            user.tokens = tokensWithoutProviderToUnlink;
            user.save((err) => {
                if (err) {
                    return next(err);
                }
                req.flash('info', { msg: `${_.startCase(_.toLower(provider))} account has been unlinked.` });
                res.redirect('/account');
            });
        });
    }
    /**
     * GET /reset/:token
     * Reset Password page.
     */
    static getReset(req, res, next) {
        if (req.isAuthenticated()) {
            return res.redirect('/');
        }
        const validationErrors = [];
        if (!validator.isHexadecimal(req.params.token))
            validationErrors.push({ msg: 'Invalid Token.  Please retry.' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect('/forgot');
        }
        User
            .findOne({ passwordResetToken: req.params.token })
            .where('passwordResetExpires').gt(Date.now())
            .exec((err, user) => {
                if (err) {
                    return next(err);
                }
                if (!user) {
                    req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
                    return res.redirect('/forgot');
                }
                res.render(viewPath + 'reset', {
                    title: 'Password Reset'
                });
            });
    }
    /**
     * GET /account/verify/:token
     * Verify email address
     */
    static getVerifyEmailToken(req, res, next) {
        if (req.user.emailVerified) {
            req.flash('info', { msg: 'The email address has been verified.' });
            return res.redirect('/account');
        }
        const validationErrors = [];
        if (req.params.token && (!validator.isHexadecimal(req.params.token)))
            validationErrors.push({ msg: 'Invalid Token.  Please retry.' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect('/account');
        }
        if (req.params.token === req.user.emailVerificationToken) {
            User
                .findOne({ email: req.user.email })
                .then((user) => {
                    if (!user) {
                        req.flash('errors', { msg: 'There was an error in loading your profile.' });
                        return res.redirect('back');
                    }
                    user.emailVerificationToken = '';
                    user.emailVerified = true;
                    user = user.save();
                    req.flash('info', { msg: 'Thank you for verifying your email address.' });
                    return res.redirect('/account');
                })
                .catch((error) => {
                    console.log('Error saving the user profile to the database after email verification', error);
                    req.flash('errors', { msg: 'There was an error when updating your profile.  Please try again later.' });
                    return res.redirect('/account');
                });
        }
        else {
            req.flash('errors', { msg: 'The verification link was invalid, or is for a different account.' });
            return res.redirect('/account');
        }
    }
    /**
     * GET /account/verify
     * Verify email address
     */
    static getVerifyEmail(req, res, next) {
        if (req.user.emailVerified) {
            req.flash('info', { msg: 'The email address has been verified.' });
            return res.redirect('/account');
        }
        if (!mailChecker.isValid(req.user.email)) {
            req.flash('errors', { msg: 'The email address is invalid or disposable and can not be verified.  Please update your email address and try again.' });
            return res.redirect('/account');
        }
        const createRandomToken = randomBytesAsync(16)
            .then((buf) => buf.toString('hex'));
        const setRandomToken = (token) => {
            User
                .findOne({ email: req.user.email })
                .then((user) => {
                    user.emailVerificationToken = token;
                    user = user.save();
                });
            return token;
        };
        const sendVerifyEmail = (token) => {
            const mailOptions = {
                to: req.user.email,
                from: process.env.EMAIL_FROM,
                subject: `Please verify your email address on ${process.env.SITE_NAME}`,
                text: `Thank you for registering with hackathon-starter.\n\n
        This verify your email address please click on the following link, or paste this into your browser:\n\n
        http://${req.headers.host}/account/verify/${token}\n\n
        \n\n
        Thank you!`
            };
            const mailSettings = {
                successfulType: 'info',
                successfulMsg: `An e-mail has been sent to ${req.user.email} with further instructions.`,
                loggingError: 'ERROR: Could not send verifyEmail email after security downgrade.\n',
                errorType: 'errors',
                errorMsg: 'Error sending the email verification message. Please try again shortly.',
                mailOptions,
                req
            };
            return Mailer.sendMail(mailOptions);
        };
        createRandomToken
            .then(setRandomToken)
            .then(sendVerifyEmail)
            .then(() => res.redirect('/account'))
            .catch(next);
    }
    /**
     * POST /reset/:token
     * Process the reset password request.
     */
    static postReset(req, res, next) {
        const validationErrors = [];
        if (!validator.isLength(req.body.password, { min: 8 }))
            validationErrors.push({ msg: 'Password must be at least 8 characters long' });
        if (req.body.password !== req.body.confirm)
            validationErrors.push({ msg: 'Passwords do not match' });
        if (!validator.isHexadecimal(req.params.token))
            validationErrors.push({ msg: 'Invalid Token.  Please retry.' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect('back');
        }
        const resetPassword = () => User
            .findOne({ passwordResetToken: req.params.token })
            .where('passwordResetExpires').gt(Date.now())
            .then((user) => {
                if (!user) {
                    req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
                    return res.redirect('back');
                }
                user.password = req.body.password;
                user.passwordResetToken = undefined;
                user.passwordResetExpires = undefined;
                return user.save().then(() => new Promise((resolve, reject) => {
                    req.logIn(user, (err) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(user);
                    });
                }));
            });
        const sendResetPasswordEmail = (user) => {
            if (!user) {
                return;
            }
            const mailOptions = {
                to: user.email,
                from: process.env.EMAIL_FROM,
                subject: `Your ${process.env.SITE_NAME} password has been changed`,
                text: `Hello,\n\nThis is a confirmation that the password for your account ${user.email} has just been changed.\n`
            };
            const mailSettings = {
                successfulType: 'success',
                successfulMsg: 'Success! Your password has been changed.',
                loggingError: 'ERROR: Could not send password reset confirmation email after security downgrade.\n',
                errorType: 'warning',
                errorMsg: 'Your password has been changed, however we were unable to send you a confirmation email. We will be looking into it shortly.',
                mailOptions,
                req
            };
            return Mailer.sendMail(mailOptions);
        };
        resetPassword()
            .then(sendResetPasswordEmail)
            .then(() => {
                if (!res.finished)
                    res.redirect('/');
            })
            .catch((err) => next(err));
    }
    /**
     * GET /forgot
     * Forgot Password page.
     */
    static getForgot(req, res) {
        if (req.isAuthenticated()) {
            return res.redirect('/');
        }
        res.render(viewPath + 'forgot', {
            title: 'Forgot Password'
        });
    }
    /**
     * POST /forgot
     * Create a random token, then the send user an email with a reset link.
     */
    static postForgot(req, res, next) {
        const validationErrors = [];
        if (!validator.isEmail(req.body.email))
            validationErrors.push({ msg: 'Please enter a valid email address.' });
        if (validationErrors.length) {
            req.flash('errors', validationErrors);
            return res.redirect('/forgot');
        }
        req.body.email = validator.normalizeEmail(req.body.email, { gmail_remove_dots: false });
        const createRandomToken = randomBytesAsync(16)
            .then((buf) => buf.toString('hex'));
        const setRandomToken = (token) => User
            .findOne({ email: req.body.email })
            .then((user) => {
                if (!user) {
                    req.flash('errors', { msg: 'Account with that email address does not exist.' });
                }
                else {
                    user.passwordResetToken = token;
                    user.passwordResetExpires = Date.now() + 3600000; // 1 hour
                    user = user.save();
                }
                return user;
            });
        const sendForgotPasswordEmail = (user) => {
            if (!user) {
                return;
            }
            const token = user.passwordResetToken;
            const mailOptions = {
                to: user.email,
                from: process.env.EMAIL_FROM,
                subject: `Reset your password on ${process.env.SITE_NAME}`,
                text: `You are receiving this email because you (or someone else) have requested the reset of the password for your account.\n\n
        Please click on the following link, or paste this into your browser to complete the process:\n\n
        http://${req.headers.host}/reset/${token}\n\n
        If you did not request this, please ignore this email and your password will remain unchanged.\n`
            };
            const mailSettings = {
                successfulType: 'info',
                successfulMsg: `An e-mail has been sent to ${user.email} with further instructions.`,
                loggingError: 'ERROR: Could not send forgot password email after security downgrade.\n',
                errorType: 'errors',
                errorMsg: 'Error sending the password reset message. Please try again shortly.',
                mailOptions,
                req
            };
            return Mailer.sendMail(mailOptions);
        };
        createRandomToken
            .then(setRandomToken)
            .then(sendForgotPasswordEmail)
            .then(() => res.redirect('/forgot'))
            .catch(next);
    }
    ;
}
