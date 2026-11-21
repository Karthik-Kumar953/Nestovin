-- Review M-15: no statement, lock or idle-in-transaction timeout existed for the runtime roles, so a
-- single stuck lock could hold all 10 pooled connections and stop the whole API. Role-level defaults
-- apply to every server connection made as that role. Long admin paths (grid import) raise their own
-- limit with SET LOCAL.
alter role app_api    set statement_timeout = '15s';
alter role app_api    set lock_timeout = '5s';
alter role app_api    set idle_in_transaction_session_timeout = '30s';
alter role app_worker set statement_timeout = '120s';
alter role app_worker set lock_timeout = '10s';
alter role app_worker set idle_in_transaction_session_timeout = '60s';
