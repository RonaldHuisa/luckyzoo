-- Panel admin de recolección manual de recargas
-- No crea tablas nuevas: usa deposits.bnb_topup_tx_hash, deposits.sweep_tx_hash y deposits.sweep_status.

CREATE INDEX IF NOT EXISTS idx_deposits_admin_collection
ON public.deposits(status, sweep_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposits_user_network_sweep
ON public.deposits(user_id, network, sweep_status);
