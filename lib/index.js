// Load modules

var Fs = require('fs');
var Hoek = require('hoek');
var Login = require('./login');
var Session = require('./session');
var Routes = require('./routes');
var Api = require('./api');


// Declare internals

var internals = {};


exports.register = function (plugin, options, next) {

    var api = new Api(options);

    plugin.bind({
        config: options.config,
        vault: options.vault,
        api: api
    });

    plugin.load(require);
    plugin.require({
        yar: {
            name: 'yar',
            cookieOptions: {
                isSecure: !!options.config.server.web.tls,
                password: options.vault.yar.password
            }
        },
        crumb: null,
        scooter: null,
        'hapi-auth-cookie': null
    }, function (err) {

        Hoek.assert(!err, 'Failed loading plugin: ' + err);
        plugin.ext('onPreResponse', internals.onPreResponse);

        // Authentication

        plugin.auth.strategy('session', 'cookie', 'try', {
            password: options.vault.session.password,
            validateFunc: Session.validate(api),
            isSecure: !!options.config.server.web.tls,
            clearInvalid: true,
            redirectTo: options.config.server.web.uri + '/login',
            appendNext: true,
            ttl: 365 * 24 * 60 * 60 * 1000                          // 1 Year
        });

        // Views

        plugin.views({
            path: __dirname + '/views',
            engines: {
                jade: 'jade'
            },
            compileOptions: {
                colons: true,
                pretty: true
            }
        });

        // Load paths

        plugin.route(Routes.endpoints);
        plugin.route({
            method: 'GET',
            path: '/{path*}',
            config: {
                handler: {
                    directory: {
                        path: __dirname + '/static'
                    }
                },
                auth: false
            }
        });

        return next();
    });
};


internals.onPreResponse = function (request, reply) {

    // Leave API responses alone (unformatted)

    if (request.route.app.isAPI) {
        return reply();
    }

    // Return error page

    var response = request.response;
    if (response.isBoom) {
        var error = response;
        var context = {
            profile: request.auth.credentials && request.auth.credentials.profile,
            error: error.message,
            code: error.output.statusCode === 404 ? 404 : 500,
            message: (error.output.statusCode === 404 ? 'the page you were looking for was not found' : 'something went wrong...'),
            env: {},
            server: this.config.server,
            product: this.config.product
        };

        return reply.view('error', context);
    }

    // Set default view context

    if (response.variety === 'view') {

        // Setup view variables

        var context = response.source.context;
        context.env = context.env || {};
        context.server = this.config.server;
        context.profile = request.auth.credentials && request.auth.credentials.profile;
        context.product = this.config.product;
        context.auth = {
            facebook: !!options.vault.facebook.clientId,
            twitter: !!options.vault.twitter.clientId,
            yahoo: !!options.vault.yahoo.clientId
        };
        context.isMobile = false;

        // Set mobile environment

        if (request.plugins.scooter.os.family === 'iOS' &&
            request.route.app.hasMobile) {

            context.layout = 'mobile';
            context.isMobile = true;
        }

        // Render view

        return reply();
    }

    return reply();
};


/*
internals.onRequest = function (request, next) {

    var req = request.raw.req;

    var isNotWithStupid = true;
    if (req.headers['user-agent']) {
        req.api.agent = UserAgent.parse(req.headers['user-agent']);

        if (req.url !== '/imwithstupid' &&
            req.cookies.imwithstupid === undefined) {

            // Check user-agent version

            if (req.api.agent &&
                req.api.agent.name &&
                req.api.agent.version) {

                // Normalize version

                var version = (req.api.agent.name === 'chrome' ? req.api.agent.version.replace(/\.\d+$/, '') : req.api.agent.version);

                if (version.split(/\./g).length - 1 < 2) {
                    version += '.0';
                }

                // Check version

                isNotWithStupid = ((req.api.agent.name === 'chrome' && Semver.satisfies(version, '>= 11.x.x')) ||
                                   (req.api.agent.name === 'safari' && Semver.satisfies(version, '>= 5.x.x')) ||
                                   (req.api.agent.name === 'firefox' && Semver.satisfies(version, '>= 4.x.x')));
            }
        }
    }

    if (!isNotWithStupid) {
        return next(new Response.View(self.server.views, 'stupid', context, options));
    }

    return next();
};
*/