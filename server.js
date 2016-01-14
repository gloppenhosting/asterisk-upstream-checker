'use strict'

var domain = require('domain').create();
var os = require('os');
var moment = require('moment');
var config = require('config');
var md5 = require('md5');
var mysql_config = config.get('mysql');
var asterisk_config = config.get('asterisk');
var debug = process.env.NODE_DEBUG || config.get('debug') || true;

var knex = require('knex')(
{
  client: 'mysql2',
  connection: {
    host     : (process.env.MYSQL_HOST || mysql_config.get('host') || '127.0.0.1'),
    user     : (process.env.MYSQL_USER || mysql_config.get('user') || 'root'),
    password : (process.env.MYSQL_PASSWORD || mysql_config.get('password') || ''),
    database : (process.env.MYSQL_DB || mysql_config.get('database') || 'asterisk')
  }
});

// On any errors. Write them to console and exit program with error code
domain.on('error', function (err) {
    if (debug) {
      console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), err);
    }

    process.exit(1);
});

// Encapsulate it all into a domain to catch all errors
domain.run(function () {

  // Create view name - Use md5 to make sure no lame hostname fucks with table name
  var view_name = "ps_regs_" + md5(os.hostname());
  var create_table_query = "CREATE VIEW " + view_name + " AS SELECT ps_registrations.* FROM ps_registrations INNER JOIN iaxfriends ON ps_registrations.iaxfriends_id = iaxfriends.id WHERE iaxfriends.name = '" + os.hostname() + "'";

  // Check if view for this upstream is in the database
  var check_for_view = function() {

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
          console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Created view', view_name);
        }
      });
    });
  };

  if (debug) {
    console.log(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), 'Will check and create view for ps_registrations for this server every', config.get('update_interval_sec'), 'seconds');
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
