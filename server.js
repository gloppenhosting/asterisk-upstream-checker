'use strict'


var domain = require('domain').create();
var os = require('os');
var moment = require('moment');
var config = require('config');
var md5 = require('md5');
var mysql_config = config.get('mysql');
var asterisk_config = config.get('asterisk');
var debug = process.env.NODE_DEBUG || config.get('debug') || true;
var heartBeatInterval = null;

var knex = require('knex')({
    client: 'mysql2',
    connection: {
        host: (process.env.MYSQL_HOST || mysql_config.get('host') || '127.0.0.1'),
        user: (process.env.MYSQL_USER || mysql_config.get('user') || 'root'),
        password: (process.env.MYSQL_PASSWORD || mysql_config.get('password') || ''),
        database: (process.env.MYSQL_DB || mysql_config.get('database') || 'asterisk')
    },
    pool: {
        ping: function(connection, callback) {
            connection.query({
                sql: 'SELECT 1 = 1'
            }, [], callback);
        },
        pingTimeout: 3 * 1000,
        min: 1,
        max: 2
    }
});

// On any errors. Write them to console and exit program with error code
domain.on('error', function(err) {
    if (debug) {
        console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), err);
    }

    process.exit(1);
});

// Encapsulate it all into a domain to catch all errors
domain.run(function() {

    if (heartBeatInterval) {
        clearInterval(heartBeatInterval)
        heartBeatInterval = null;
    }

    heartBeatInterval = setInterval(function() {
        knex.raw('SELECT 1=1')
            .then(function() {
                //  log.info('heartbeat sent');
            })
            .catch(function(err) {
                console.error('Knex heartbeat error, shutting down', err);
                process.exit(1);
            })
    }, 10000);

    // Create view name - Use md5 to make sure no lame hostname fucks with table name
    var view_name = "ps_endpoints_external_" + md5(os.hostname());
    var create_table_query = "CREATE VIEW " + view_name + " AS SELECT ps_endpoints.* FROM ps_endpoints INNER JOIN ps_endpoints_has_iaxfriends AS X ON X.ps_endpoints_id = ps_endpoints.id INNER JOIN iaxfriends AS Y ON X.iaxfriends_id = Y.id WHERE ps_endpoints.context = 'external' AND Y.name = '" + os.hostname() + "'";

    var view_name2 = "ps_regs_" + md5(os.hostname());
    var create_table_query2 = "CREATE VIEW " + view_name2 + " AS SELECT ps_registrations.* FROM ps_endpoints_has_iaxfriends INNER JOIN ps_registrations ON ps_registrations.id = ps_endpoints_has_iaxfriends.ps_endpoints_id INNER JOIN iaxfriends ON ps_endpoints_has_iaxfriends.iaxfriends_id = iaxfriends.id WHERE iaxfriends.name = '" + os.hostname() + "'";

    var view_name3 = "ps_aors_" + md5(os.hostname());
    var create_table_query3 = "CREATE VIEW " + view_name3 + " AS SELECT ps_aors.* FROM ps_aors INNER JOIN ps_endpoints AS Z ON Z.aors = ps_aors.id INNER JOIN ps_endpoints_has_iaxfriends AS X ON X.ps_endpoints_id = Z.id INNER JOIN iaxfriends AS Y ON X.iaxfriends_id = Y.id WHERE Z.context = 'external' AND Y.name = '" + os.hostname() + "'";

    var view_endpoint_internal = "ps_endpoints_internal";
    var create_table_endpoint_internal = "CREATE VIEW " + view_endpoint_internal + " AS SELECT ps_endpoints.* FROM ps_endpoints WHERE context = 'internal'";

    var view_aors_internal = "ps_aors_internal";
    var create_table_aors_internal = "CREATE VIEW " + view_aors_internal + " AS SELECT ps_aors.* FROM ps_aors INNER JOIN ps_endpoints ON ps_aors.id = ps_endpoints.aors WHERE ps_endpoints.context = 'internal'";

    var view_contacts_internal = "ps_contacts_" + md5(os.hostname());
    var create_table_contacts_internal = "CREATE VIEW " + view_contacts_internal + " AS SELECT * FROM ps_contacts WHERE regserver = (SELECT ipaddr FROM iaxfriends WHERE name = '" + os.hostname() + "')";

    var view_contacts_internal2 = "psc_" + md5(os.hostname());
    var create_table_contacts_internal2 = "CREATE VIEW " + view_contacts_internal2 + " AS SELECT * FROM ps_contacts WHERE regserver = (SELECT ipaddr FROM iaxfriends WHERE name = '" + os.hostname() + "')";

    // Check if view for this upstream is in the database
    var check_for_view = function() {

        knex.select('id')
            .from(view_contacts_internal2)
            .catch(function(error) {
                // Create view as it's missing
                knex.transaction(function(trx) {
                        trx
                            .raw(create_table_contacts_internal2)
                            .then(trx.commit)
                            .catch(trx.rollback);
                    })
                    .then(function(resp) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view for ps_contacts', view_contacts_internal2);
                        }
                    })
                    .catch(function(error) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Unable to create view for ps_contacts', view_contacts_internal2, error);
                        }
                    });
            });

        knex.select('id')
            .from(view_contacts_internal)
            .catch(function(error) {
                // Create view as it's missing
                knex.transaction(function(trx) {
                        trx
                            .raw(create_table_contacts_internal)
                            .then(trx.commit)
                            .catch(trx.rollback);
                    })
                    .then(function(resp) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view for ps_contacts', view_contacts_internal);
                        }
                    })
                    .catch(function(error) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Unable to create view for ps_contacts', view_contacts_internal, error);
                        }
                    });
            });

        knex.select('id')
            .from(view_endpoint_internal)
            .catch(function(error) {
                // Create view as it's missing
                knex.transaction(function(trx) {
                        trx
                            .raw(create_table_endpoint_internal)
                            .then(trx.commit)
                            .catch(trx.rollback);
                    })
                    .then(function(resp) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view for ps_endpoints internal', view_endpoint_internal);
                        }
                    })
                    .catch(function(error) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Unable to create view for ps_endpoints internal', view_endpoint_internal, error);
                        }
                    });
            });

        knex.select('id')
            .from(view_aors_internal)
            .catch(function(error) {
                // Create view as it's missing
                knex.transaction(function(trx) {
                        trx
                            .raw(create_table_aors_internal)
                            .then(trx.commit)
                            .catch(trx.rollback);
                    })
                    .then(function(resp) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view for ps_aors internal', view_aors_internal);
                        }
                    })
                    .catch(function(error) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Unable to create view for ps_aors internal', view_aors_internal, error);
                        }
                    });
            });

        // Only do this on upstream servers
        if (os.hostname().toString().indexOf('upstream') <= -1) {
            return;
        }

        knex.select('id')
            .from(view_name)
            .catch(function(error) {
                // Create view as it's missing
                knex.transaction(function(trx) {
                        trx
                            .raw(create_table_query)
                            .then(trx.commit)
                            .catch(trx.rollback);
                    })
                    .then(function(resp) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view for ps_endpoints', view_name);
                        }
                    })
                    .catch(function(error) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Unable to create view for ps_endpoints', view_name, error);
                        }
                    });
            });

        knex.select('id')
            .from(view_name2)
            .catch(function(error) {
                // Create view as it's missing
                knex.transaction(function(trx) {
                        trx
                            .raw(create_table_query2)
                            .then(trx.commit)
                            .catch(trx.rollback);
                    })
                    .then(function(resp) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view for ps_registrations', view_name2);
                        }
                    })
                    .catch(function(error) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Unable to create view for ps_registrations', view_name2, error);
                        }
                    });
            });

        knex.select('id')
            .from(view_name3)
            .catch(function(error) {
                // Create view as it's missing
                knex.transaction(function(trx) {
                        trx
                            .raw(create_table_query3)
                            .then(trx.commit)
                            .catch(trx.rollback);
                    })
                    .then(function(resp) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view for ps_aors', view_name3);
                        }
                    })
                    .catch(function(error) {
                        if (debug) {
                            console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Unable to create view for ps_aors', view_name3, error);
                        }
                    });
            });
    };

    if (debug) {
        console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Will check and create view for ps_endpoints and ps_registrations for this server every', config.get('update_interval_sec'), 'seconds');
    }

    // Lets update on first run!
    check_for_view();

    // Start timer
    var update_timer = setInterval(function() {
            check_for_view();
        },
        (config.get('update_interval_sec') * 1000)
    );
});
