var crypto = require('crypto');


module.exports = function (CONF)
{
    var that = this;


    /** getHostID
     *
     * @param host
     * @param port
     * @param cb
     */
    this.getHostID = function (host, port, cb)
    {
        var sql = that.format(that.sqlTemplates["getHostID"], [CONF.get("DB_CONNECTION_HOST_DB"), host, port]);
        that.query(sql, function (err, result)
        {
            if (err || result.length === 0)
            {
                cb(true);
            }
            else
            {
                cb(false, result[0]["id"]);
            }
        });
    };


    /** addHost
     *
     * @param host String "www.example.com:90" ||
     * @param port
     * @param cb
     */
    this.addHost = function (host, port, cb)
    {
        var hostParts = host.split(":");
        if (hostParts.length == 2)
        {
            host = hostParts[0];
            port = hostParts[1];
        }

        if (port === null)
        {
            port = 80;
        }

        // check if the host exist
        that.getHostID(host, port, function (err, host_id)
        {
            if (!err)
            {
                cb(false, host_id);
            }
            else
            {
                var sql = that.format(that.sqlTemplates["addHost"], [CONF.get("DB_CONNECTION_HOST_DB"), host, port]);
                that.query(sql, function (err, result)
                {
                    if (!err && result.affectedRows === 1 && result.insertId !== undefined)
                    {
                        cb(err, result.insertId);
                    }
                    else
                    {
                        cb(true);
                    }
                });
            }
        });
    };


    this.updateHostStatus = function (hostID, status, cb)
    {
        var sql = that.format(that.sqlTemplates["updateHostStatus"], [CONF.get("DB_CONNECTION_HOST_DB"), status, hostID]);
        that.query(sql, function (err, result)
        {
            cb && cb(err);
        });
    };


    this.cleanHost = function (hostID, cb)
    {
        var sql = that.format(that.sqlTemplates["cleanHost"], [
            CONF.get("DB_CONNECTION_INDEX_DB"), hostID,
            CONF.get("DB_CONNECTION_HOST_DB"), hostID
        ]);
        that.query(sql, function (err, result)
        {
            cb(err);
        });
    };


    this.getAvailableHost = function (cb)
    {
        // get the first available host from the db
        var sql = that.format(that.sqlTemplates["getHostByStatus"], [
                CONF.get("DB_CONNECTION_HOST_DB"),
                /* Status: un-indexed */ 0
            ]) + " ORDER by priority DESC LIMIT 1";
        that.query(sql, function (err, result)
        {
            if (err || result.length === 0)
            {
                cb(true);
                return;
            }
            cb(false, result[0]["id"], result[0]["hostname"], result[0]["port"]);
        });
    };


    this.indexPage = function (host_id, hostname, page, title, anchor_text, level, html, text, extraArgs, cb)
    {
        if (!anchor_text)
        {
            anchor_text = "";
            if (title)
            {
                anchor_text = title;
            }
        }

        var unescapedSql = that.sqlTemplates["indexPage"];
        var inserts = [CONF.get("DB_CONNECTION_INDEX_DB"), host_id, hostname, page, title, anchor_text, level, text];

        if (CONF.get("CACHE_MODE") === 1)
        {
            unescapedSql += ",`cache`= ?";
            inserts.push(html);
        }
        else if (CONF.get("CACHE_MODE") === 2)
        {
            unescapedSql += ",`cache`= COMPRESS( ? )";
            inserts.push(html);
        }

        var md5sum = crypto.createHash('md5');
        md5sum.update(html);
        unescapedSql += ",`html_md5`=?";
        inserts.push(md5sum.digest('hex'));

        var sql = that.format(unescapedSql, inserts);
        that.query(sql, function (err)
        {
            cb && cb(err);
        });

    };


    this._savePagesMap = function (baseHostID, baseHost, basePage, linkedHostID, linkedHost, linkedPage, anchor, cb)
    {
        var sql = that.format(that.sqlTemplates["savePageMap"], [
            CONF.get("DB_CONNECTION_HOST_DB"),
            baseHostID,
            basePage,
            linkedHostID,
            linkedPage,
            anchor
        ]);
        that.query(sql, function (err, result)
        {
            cb && cb();
        });
    };


    this.getPagesMap = function(host, page, cb)
    {
        var uparsedSqlLinks = "USE ??;\n";

        // get links
        uparsedSqlLinks += "select CONCAT(hostname, linkedpage) as url, textlink from " +
        " ( select linkedhost_id, linkedpage, textlink from hostlist inner join pages_map on hostlist.id = pages_map.host_id where hostname = ? and page = ? ) as subtb " +
        " inner join hostlist on hostlist.id = subtb.linkedhost_id;\n";

        // get linked by
        uparsedSqlLinks += "select CONCAT(hostname, page) as url, textlink from " +
        " ( select host_id, page, textlink from hostlist inner join pages_map on hostlist.id = pages_map.linkedhost_id where hostname = ? and linkedpage = ? ) as subtb " +
        " inner join hostlist on hostlist.id = subtb.host_id;";

        var sql = that.format(uparsedSqlLinks, [CONF.get("DB_CONNECTION_HOST_DB"),
            host,
            page,
            host,
            page
        ]);

        that.query(sql, function (err, result)
        {
            if (!err)
            {
                // result[0] = USE...
                // resutl[1] = SELECT LINKS
                // resutl[2] = SELECT LINKED BY
                cb(null, result[1], result[2]);
            }
            else
            {
                cb(err);
            }
        });
    };


    this.deleteDuplicatePages = function (hostID, cb)
    {
        var sql = that.format(that.sqlTemplates["deleteDupPages"], [
            CONF.get("DB_CONNECTION_INDEX_DB"), hostID,
            CONF.get("DB_CONNECTION_INDEX_DB"), hostID
        ]);
        that.query(sql, function (err, result)
        {
            cb && cb(err);
        });
    };

};
