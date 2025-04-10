========
Requests
========


BaseStockLatestDataRequest
--------------------------

.. autoclass:: alpaca.data.requests.BaseStockLatestDataRequest


StockBarsRequest
----------------

.. autoclass:: alpaca.data.requests.StockBarsRequest


StockQuotesRequest
------------------

.. autoclass:: alpaca.data.requests.StockQuotesRequest


StockTradesRequest
------------------

.. autoclass:: alpaca.data.requests.StockTradesRequest


StockLatestQuoteRequest
-----------------------

.. autoclass:: alpaca.data.requests.StockLatestQuoteRequest


StockLatestTradeRequest
-----------------------

.. autoclass:: alpaca.data.requests.StockLatestTradeRequest


StockSnapshotRequest
--------------------

.. autoclass:: alpaca.data.requests.StockSnapshotRequest


MostActivesRequest
------------------

.. autoclass:: alpaca.data.requests.MostActivesRequest


MarketMoversRequest
-------------------

.. autoclass:: alpaca.data.requests.MarketMoversRequest

Market Data (Historical)
# setup stock historical data client
stock_historical_data_client = StockHistoricalDataClient(api_key, secret_key, url_override = data_api_url)
# get historical bars by symbol
# ref. https://docs.alpaca.markets/reference/stockbars-1
now = datetime.now(ZoneInfo("America/New_York"))
req = StockBarsRequest(
    symbol_or_symbols = [symbol],
    timeframe=TimeFrame(amount = 1, unit = TimeFrameUnit.Hour), # specify timeframe
    start = now - timedelta(days = 5),                          # specify start datetime, default=the beginning of the current day.
    # end_date=None,                                        # specify end datetime, default=now
    limit = 2,                                               # specify limit
)
stock_historical_data_client.get_stock_bars(req).df
# get historical trades by symbol
req = StockTradesRequest(
    symbol_or_symbols = [symbol],
    start = now - timedelta(days = 5),                          # specify start datetime, default=the beginning of the current day.
    # end=None,                                             # specify end datetime, default=now
    limit = 2,                                                # specify limit
)
stock_historical_data_client.get_stock_trades(req).df
# get historical quotes by symbol
req = StockQuotesRequest(
    symbol_or_symbols = [symbol],
    start = now - timedelta(days = 5),                      # specify start datetime, default=the beginning of the current day.
    # end=None,                                             # specify end datetime, default=now
    limit = 2,                                              # specify limit
)
stock_historical_data_client.get_stock_quotes(req).df
# get latest quotes by symbol
req = StockQuotesRequest(
    symbol_or_symbols = [symbol],
)
res = stock_historical_data_client.get_stock_latest_quote(req)
res
Market Data (Stream)
stock_data_stream_client = StockDataStream(api_key, secret_key, url_override = stream_data_wss)

async def stock_data_stream_handler(data):
    print(data)

symbols = [symbol]

stock_data_stream_client.subscribe_quotes(stock_data_stream_handler, *symbols)
stock_data_stream_client.subscribe_trades(stock_data_stream_handler, *symbols)

stock_data_stream_client.run()


(.venv) (base) cristian_mendoza@MacBookPro clera % cd backend && python -c "from alpaca.broker import BrokerClient; print(dir(Brokecd backend && python -c "from alpaca.broker import BrokerClient; print(dir(BrokerClient))"
['__abstractmethods__', '__class__', '__delattr__', '__dict__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', '__getattribute__', '__getstate__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__le__', '__lt__', '__module__', '__ne__', '__new__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__slots__', '__str__', '__subclasshook__', '__weakref__', '_abc_impl', '_get_account_activities_iterator', '_get_auth_headers', '_get_default_headers', '_get_marketdata', '_get_sse_headers', '_get_transfers_iterator', '_iterate_over_pages', '_one_request', '_parse_activity', '_request', '_return_paginated_result', '_validate_credentials', '_validate_pagination', 'add_asset_to_watchlist_for_account_by_id', 'cancel_journal_by_id', 'cancel_order_for_account_by_id', 'cancel_orders_for_account', 'cancel_run_by_id', 'cancel_transfer_for_account', 'close_account', 'close_all_positions_for_account', 'close_position_for_account', 'create_account', 'create_ach_relationship_for_account', 'create_bank_for_account', 'create_batch_journal', 'create_journal', 'create_manual_run', 'create_portfolio', 'create_reverse_batch_journal', 'create_subscription', 'create_transfer_for_account', 'create_watchlist_for_account', 'delete', 'delete_account', 'delete_ach_relationship_for_account', 'delete_bank_for_account', 'delete_watchlist_from_account_by_id', 'download_trade_document_for_account_by_id', 'exercise_options_position_for_account_by_id', 'get', 'get_account_activities', 'get_account_by_id', 'get_account_status_events', 'get_ach_relationships_for_account', 'get_all_accounts_positions', 'get_all_assets', 'get_all_portfolios', 'get_all_positions_for_account', 'get_all_runs', 'get_all_subscriptions', 'get_asset', 'get_banks_for_account', 'get_calendar', 'get_cip_data_for_account_by_id', 'get_clock', 'get_corporate_announcement_by_id', 'get_corporate_announcements', 'get_journal_by_id', 'get_journal_events', 'get_journals', 'get_non_trading_activity_events', 'get_open_position_for_account', 'get_order_for_account_by_client_id', 'get_order_for_account_by_id', 'get_orders_for_account', 'get_portfolio_by_id', 'get_portfolio_history_for_account', 'get_run_by_id', 'get_subscription_by_id', 'get_trade_account_by_id', 'get_trade_configuration_for_account', 'get_trade_document_for_account_by_id', 'get_trade_documents_for_account', 'get_trade_events', 'get_transfer_events', 'get_transfers_for_account', 'get_watchlist_for_account_by_id', 'get_watchlists_for_account', 'inactivate_portfolio_by_id', 'list_accounts', 'patch', 'post', 'put', 'remove_asset_from_watchlist_for_account_by_id', 'replace_order_for_account_by_id', 'response_wrapper', 'submit_order_for_account', 'unsubscribe_account', 'update_account', 'update_portfolio_by_id', 'update_trade_configuration_for_account', 'update_watchlist_for_account_by_id', 'upload_cip_data_for_account_by_id', 'upload_documents_to_account']
(.venv) (base) cristian_mendoza@MacBookPro backend % 