--
-- PostgreSQL database dump
--

\restrict W0Xz3QUrkNCQizvPzO3RaXL5dywaMBW2bUMri1pscf7ke0Caaf6yKwHRQo9EbBh

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-05-08 23:41:57

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 16734)
-- Name: account_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_ledger (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(150) NOT NULL,
    amount_usdt numeric(38,18) NOT NULL,
    balance_type character varying(50) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    direction character varying(20) NOT NULL,
    description text,
    reference_type character varying(50),
    reference_id integer,
    status character varying(30) DEFAULT 'completed'::character varying
);


ALTER TABLE public.account_ledger OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16733)
-- Name: account_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.account_ledger_id_seq OWNER TO postgres;

--
-- TOC entry 5183 (class 0 OID 0)
-- Dependencies: 227
-- Name: account_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.account_ledger_id_seq OWNED BY public.account_ledger.id;


--
-- TOC entry 224 (class 1259 OID 16667)
-- Name: deposits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deposits (
    id integer NOT NULL,
    user_id integer NOT NULL,
    wallet_id integer NOT NULL,
    network character varying(50) DEFAULT 'BEP20-USDT'::character varying NOT NULL,
    token_contract character varying(255) NOT NULL,
    tx_hash character varying(255) NOT NULL,
    log_index integer NOT NULL,
    block_number bigint NOT NULL,
    amount_raw text NOT NULL,
    amount_usdt numeric(38,18) NOT NULL,
    status character varying(30) DEFAULT 'confirmed'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sweep_status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    bnb_topup_tx_hash character varying(255),
    sweep_tx_hash character varying(255),
    swept_at timestamp without time zone
);


ALTER TABLE public.deposits OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16666)
-- Name: deposits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deposits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deposits_id_seq OWNER TO postgres;

--
-- TOC entry 5184 (class 0 OID 0)
-- Dependencies: 223
-- Name: deposits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deposits_id_seq OWNED BY public.deposits.id;


--
-- TOC entry 230 (class 1259 OID 16773)
-- Name: referral_commissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.referral_commissions (
    id integer NOT NULL,
    receiver_user_id integer NOT NULL,
    source_user_id integer NOT NULL,
    level integer NOT NULL,
    source_type character varying(50) NOT NULL,
    source_id integer NOT NULL,
    base_amount_usdt numeric(38,18) NOT NULL,
    percent numeric(8,4) NOT NULL,
    amount_usdt numeric(38,18) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.referral_commissions OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16772)
-- Name: referral_commissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.referral_commissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.referral_commissions_id_seq OWNER TO postgres;

--
-- TOC entry 5185 (class 0 OID 0)
-- Dependencies: 229
-- Name: referral_commissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.referral_commissions_id_seq OWNED BY public.referral_commissions.id;


--
-- TOC entry 238 (class 1259 OID 16999)
-- Name: referral_reward_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.referral_reward_tiers (
    id integer NOT NULL,
    required_invites integer NOT NULL,
    reward_usdt numeric(18,8) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.referral_reward_tiers OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 16998)
-- Name: referral_reward_tiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.referral_reward_tiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.referral_reward_tiers_id_seq OWNER TO postgres;

--
-- TOC entry 5186 (class 0 OID 0)
-- Dependencies: 237
-- Name: referral_reward_tiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.referral_reward_tiers_id_seq OWNED BY public.referral_reward_tiers.id;


--
-- TOC entry 240 (class 1259 OID 17017)
-- Name: user_referral_rewards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_referral_rewards (
    id integer NOT NULL,
    user_id integer NOT NULL,
    tier_id integer NOT NULL,
    invite_count_snapshot integer DEFAULT 0 NOT NULL,
    reward_usdt numeric(18,8) NOT NULL,
    status character varying(30) DEFAULT 'claimed'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    claimed_at timestamp without time zone
);


ALTER TABLE public.user_referral_rewards OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 17016)
-- Name: user_referral_rewards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_referral_rewards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_referral_rewards_id_seq OWNER TO postgres;

--
-- TOC entry 5187 (class 0 OID 0)
-- Dependencies: 239
-- Name: user_referral_rewards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_referral_rewards_id_seq OWNED BY public.user_referral_rewards.id;


--
-- TOC entry 220 (class 1259 OID 16623)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    security_password_hash text,
    referral_code character varying(20) NOT NULL,
    invited_by character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    balance_usdt numeric(38,18) DEFAULT 0 NOT NULL,
    withdrawable_usdt numeric(38,18) DEFAULT 0 NOT NULL,
    withdrawal_address_bep20 text,
    is_admin boolean DEFAULT false NOT NULL,
    referred_by_id integer,
    vip_level integer DEFAULT 0 NOT NULL,
    vip_purchased_at timestamp without time zone,
    earnings_balance_usdt numeric(38,18) DEFAULT 0,
    recharge_balance_usdt numeric(38,18) DEFAULT 0,
    vip_expires_at timestamp without time zone
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16622)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- TOC entry 5188 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 236 (class 1259 OID 16868)
-- Name: vip_daily_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vip_daily_tasks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    vip_purchase_id integer NOT NULL,
    vip_level integer NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    reward_usdt numeric(38,18) NOT NULL,
    status character varying(30) DEFAULT 'completed'::character varying NOT NULL,
    completed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.vip_daily_tasks OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16867)
-- Name: vip_daily_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vip_daily_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vip_daily_tasks_id_seq OWNER TO postgres;

--
-- TOC entry 5189 (class 0 OID 0)
-- Dependencies: 235
-- Name: vip_daily_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vip_daily_tasks_id_seq OWNED BY public.vip_daily_tasks.id;


--
-- TOC entry 232 (class 1259 OID 16809)
-- Name: vip_packages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vip_packages (
    id integer NOT NULL,
    level integer NOT NULL,
    name character varying(50) NOT NULL,
    price_usdt numeric(38,18) DEFAULT 0 NOT NULL,
    daily_income_usdt numeric(38,18) DEFAULT 0 NOT NULL,
    task_reward_usdt numeric(38,18),
    task_cooldown_minutes integer,
    valid_days integer DEFAULT 365 NOT NULL,
    is_purchasable boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vip_packages OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16808)
-- Name: vip_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vip_packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vip_packages_id_seq OWNER TO postgres;

--
-- TOC entry 5190 (class 0 OID 0)
-- Dependencies: 231
-- Name: vip_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vip_packages_id_seq OWNED BY public.vip_packages.id;


--
-- TOC entry 234 (class 1259 OID 16830)
-- Name: vip_purchases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vip_purchases (
    id integer NOT NULL,
    user_id integer NOT NULL,
    package_id integer NOT NULL,
    level integer NOT NULL,
    price_usdt numeric(38,18) NOT NULL,
    daily_income_usdt numeric(38,18) NOT NULL,
    purchased_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL
);


ALTER TABLE public.vip_purchases OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16829)
-- Name: vip_purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vip_purchases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vip_purchases_id_seq OWNER TO postgres;

--
-- TOC entry 5191 (class 0 OID 0)
-- Dependencies: 233
-- Name: vip_purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vip_purchases_id_seq OWNED BY public.vip_purchases.id;


--
-- TOC entry 222 (class 1259 OID 16641)
-- Name: wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    network character varying(50) DEFAULT 'BEP20-USDT'::character varying NOT NULL,
    address character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    public_key text,
    private_key_encrypted text,
    last_scanned_block bigint DEFAULT 0 NOT NULL
);


ALTER TABLE public.wallets OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16640)
-- Name: wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wallets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallets_id_seq OWNER TO postgres;

--
-- TOC entry 5192 (class 0 OID 0)
-- Dependencies: 221
-- Name: wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wallets_id_seq OWNED BY public.wallets.id;


--
-- TOC entry 226 (class 1259 OID 16707)
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.withdrawals (
    id integer NOT NULL,
    user_id integer NOT NULL,
    network character varying(50) DEFAULT 'BEP20-USDT'::character varying NOT NULL,
    withdrawal_address text NOT NULL,
    amount_requested numeric(38,18) NOT NULL,
    fee_percent numeric(8,4) DEFAULT 8 NOT NULL,
    fee_amount numeric(38,18) NOT NULL,
    amount_to_receive numeric(38,18) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    tx_hash character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    paid_at timestamp without time zone,
    approved_by integer,
    approved_at timestamp without time zone,
    admin_note text
);


ALTER TABLE public.withdrawals OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16706)
-- Name: withdrawals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.withdrawals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.withdrawals_id_seq OWNER TO postgres;

--
-- TOC entry 5193 (class 0 OID 0)
-- Dependencies: 225
-- Name: withdrawals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.withdrawals_id_seq OWNED BY public.withdrawals.id;


--
-- TOC entry 4928 (class 2604 OID 16737)
-- Name: account_ledger id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_ledger ALTER COLUMN id SET DEFAULT nextval('public.account_ledger_id_seq'::regclass);


--
-- TOC entry 4918 (class 2604 OID 16670)
-- Name: deposits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposits ALTER COLUMN id SET DEFAULT nextval('public.deposits_id_seq'::regclass);


--
-- TOC entry 4932 (class 2604 OID 16776)
-- Name: referral_commissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_commissions ALTER COLUMN id SET DEFAULT nextval('public.referral_commissions_id_seq'::regclass);


--
-- TOC entry 4947 (class 2604 OID 17002)
-- Name: referral_reward_tiers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_reward_tiers ALTER COLUMN id SET DEFAULT nextval('public.referral_reward_tiers_id_seq'::regclass);


--
-- TOC entry 4951 (class 2604 OID 17020)
-- Name: user_referral_rewards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_referral_rewards ALTER COLUMN id SET DEFAULT nextval('public.user_referral_rewards_id_seq'::regclass);


--
-- TOC entry 4906 (class 2604 OID 16626)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 4943 (class 2604 OID 16871)
-- Name: vip_daily_tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_daily_tasks ALTER COLUMN id SET DEFAULT nextval('public.vip_daily_tasks_id_seq'::regclass);


--
-- TOC entry 4934 (class 2604 OID 16812)
-- Name: vip_packages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_packages ALTER COLUMN id SET DEFAULT nextval('public.vip_packages_id_seq'::regclass);


--
-- TOC entry 4940 (class 2604 OID 16833)
-- Name: vip_purchases id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_purchases ALTER COLUMN id SET DEFAULT nextval('public.vip_purchases_id_seq'::regclass);


--
-- TOC entry 4914 (class 2604 OID 16644)
-- Name: wallets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets ALTER COLUMN id SET DEFAULT nextval('public.wallets_id_seq'::regclass);


--
-- TOC entry 4923 (class 2604 OID 16710)
-- Name: withdrawals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.withdrawals ALTER COLUMN id SET DEFAULT nextval('public.withdrawals_id_seq'::regclass);


--
-- TOC entry 4981 (class 2606 OID 16749)
-- Name: account_ledger account_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_ledger
    ADD CONSTRAINT account_ledger_pkey PRIMARY KEY (id);


--
-- TOC entry 4969 (class 2606 OID 16688)
-- Name: deposits deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_pkey PRIMARY KEY (id);


--
-- TOC entry 4972 (class 2606 OID 16690)
-- Name: deposits deposits_tx_hash_log_index_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_tx_hash_log_index_key UNIQUE (tx_hash, log_index);


--
-- TOC entry 4988 (class 2606 OID 16788)
-- Name: referral_commissions referral_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_pkey PRIMARY KEY (id);


--
-- TOC entry 4990 (class 2606 OID 16790)
-- Name: referral_commissions referral_commissions_receiver_user_id_source_type_source_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_receiver_user_id_source_type_source_id_key UNIQUE (receiver_user_id, source_type, source_id, level);


--
-- TOC entry 5007 (class 2606 OID 17013)
-- Name: referral_reward_tiers referral_reward_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_reward_tiers
    ADD CONSTRAINT referral_reward_tiers_pkey PRIMARY KEY (id);


--
-- TOC entry 5009 (class 2606 OID 17015)
-- Name: referral_reward_tiers referral_reward_tiers_required_invites_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_reward_tiers
    ADD CONSTRAINT referral_reward_tiers_required_invites_key UNIQUE (required_invites);


--
-- TOC entry 5013 (class 2606 OID 17032)
-- Name: user_referral_rewards user_referral_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_referral_rewards
    ADD CONSTRAINT user_referral_rewards_pkey PRIMARY KEY (id);


--
-- TOC entry 5015 (class 2606 OID 17034)
-- Name: user_referral_rewards user_referral_rewards_user_id_tier_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_referral_rewards
    ADD CONSTRAINT user_referral_rewards_user_id_tier_id_key UNIQUE (user_id, tier_id);


--
-- TOC entry 4956 (class 2606 OID 16637)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4958 (class 2606 OID 16635)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4960 (class 2606 OID 16639)
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- TOC entry 5001 (class 2606 OID 16884)
-- Name: vip_daily_tasks vip_daily_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_daily_tasks
    ADD CONSTRAINT vip_daily_tasks_pkey PRIMARY KEY (id);


--
-- TOC entry 5004 (class 2606 OID 16886)
-- Name: vip_daily_tasks vip_daily_tasks_user_id_vip_purchase_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_daily_tasks
    ADD CONSTRAINT vip_daily_tasks_user_id_vip_purchase_id_period_start_key UNIQUE (user_id, vip_purchase_id, period_start);


--
-- TOC entry 4992 (class 2606 OID 16828)
-- Name: vip_packages vip_packages_level_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_packages
    ADD CONSTRAINT vip_packages_level_key UNIQUE (level);


--
-- TOC entry 4994 (class 2606 OID 16826)
-- Name: vip_packages vip_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_packages
    ADD CONSTRAINT vip_packages_pkey PRIMARY KEY (id);


--
-- TOC entry 4996 (class 2606 OID 16845)
-- Name: vip_purchases vip_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_purchases
    ADD CONSTRAINT vip_purchases_pkey PRIMARY KEY (id);


--
-- TOC entry 4964 (class 2606 OID 16654)
-- Name: wallets wallets_address_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_address_key UNIQUE (address);


--
-- TOC entry 4966 (class 2606 OID 16652)
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- TOC entry 4978 (class 2606 OID 16727)
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);


--
-- TOC entry 4979 (class 1259 OID 16864)
-- Name: account_ledger_balance_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_ledger_balance_type_idx ON public.account_ledger USING btree (balance_type);


--
-- TOC entry 4982 (class 1259 OID 16865)
-- Name: account_ledger_reference_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_ledger_reference_idx ON public.account_ledger USING btree (reference_type, reference_id);


--
-- TOC entry 4983 (class 1259 OID 16863)
-- Name: account_ledger_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_ledger_type_idx ON public.account_ledger USING btree (type);


--
-- TOC entry 4984 (class 1259 OID 16866)
-- Name: account_ledger_unique_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_ledger_unique_reference ON public.account_ledger USING btree (reference_type, reference_id, type) WHERE ((reference_type IS NOT NULL) AND (reference_id IS NOT NULL));


--
-- TOC entry 4985 (class 1259 OID 16862)
-- Name: account_ledger_user_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_ledger_user_created_idx ON public.account_ledger USING btree (user_id, created_at DESC);


--
-- TOC entry 4986 (class 1259 OID 16858)
-- Name: account_ledger_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_ledger_user_id_idx ON public.account_ledger USING btree (user_id);


--
-- TOC entry 4967 (class 1259 OID 16804)
-- Name: deposits_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deposits_created_at_idx ON public.deposits USING btree (created_at);


--
-- TOC entry 4970 (class 1259 OID 16803)
-- Name: deposits_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deposits_status_idx ON public.deposits USING btree (status);


--
-- TOC entry 4973 (class 1259 OID 16801)
-- Name: deposits_tx_log_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX deposits_tx_log_unique ON public.deposits USING btree (tx_hash, log_index);


--
-- TOC entry 4974 (class 1259 OID 16701)
-- Name: deposits_unique_tx_log; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX deposits_unique_tx_log ON public.deposits USING btree (tx_hash, log_index);


--
-- TOC entry 4975 (class 1259 OID 16802)
-- Name: deposits_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deposits_user_id_idx ON public.deposits USING btree (user_id);


--
-- TOC entry 4976 (class 1259 OID 16805)
-- Name: deposits_user_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deposits_user_status_idx ON public.deposits USING btree (user_id, status);


--
-- TOC entry 5010 (class 1259 OID 17046)
-- Name: idx_user_referral_rewards_tier_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_referral_rewards_tier_id ON public.user_referral_rewards USING btree (tier_id);


--
-- TOC entry 5011 (class 1259 OID 17045)
-- Name: idx_user_referral_rewards_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_referral_rewards_user_id ON public.user_referral_rewards USING btree (user_id);


--
-- TOC entry 4961 (class 1259 OID 16770)
-- Name: users_referral_code_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_referral_code_unique ON public.users USING btree (referral_code);


--
-- TOC entry 4962 (class 1259 OID 16771)
-- Name: users_referred_by_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_referred_by_id_idx ON public.users USING btree (referred_by_id);


--
-- TOC entry 4999 (class 1259 OID 16898)
-- Name: vip_daily_tasks_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vip_daily_tasks_period_idx ON public.vip_daily_tasks USING btree (period_start, period_end);


--
-- TOC entry 5002 (class 1259 OID 16897)
-- Name: vip_daily_tasks_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vip_daily_tasks_user_id_idx ON public.vip_daily_tasks USING btree (user_id);


--
-- TOC entry 5005 (class 1259 OID 16899)
-- Name: vip_daily_tasks_vip_purchase_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vip_daily_tasks_vip_purchase_idx ON public.vip_daily_tasks USING btree (vip_purchase_id);


--
-- TOC entry 4997 (class 1259 OID 16857)
-- Name: vip_purchases_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vip_purchases_status_idx ON public.vip_purchases USING btree (status);


--
-- TOC entry 4998 (class 1259 OID 16856)
-- Name: vip_purchases_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vip_purchases_user_id_idx ON public.vip_purchases USING btree (user_id);


--
-- TOC entry 5022 (class 2606 OID 16750)
-- Name: account_ledger account_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_ledger
    ADD CONSTRAINT account_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5018 (class 2606 OID 16691)
-- Name: deposits deposits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5019 (class 2606 OID 16696)
-- Name: deposits deposits_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- TOC entry 5023 (class 2606 OID 16791)
-- Name: referral_commissions referral_commissions_receiver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_receiver_user_id_fkey FOREIGN KEY (receiver_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5024 (class 2606 OID 16796)
-- Name: referral_commissions referral_commissions_source_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_source_user_id_fkey FOREIGN KEY (source_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5029 (class 2606 OID 17040)
-- Name: user_referral_rewards user_referral_rewards_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_referral_rewards
    ADD CONSTRAINT user_referral_rewards_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.referral_reward_tiers(id) ON DELETE CASCADE;


--
-- TOC entry 5030 (class 2606 OID 17035)
-- Name: user_referral_rewards user_referral_rewards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_referral_rewards
    ADD CONSTRAINT user_referral_rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5016 (class 2606 OID 16763)
-- Name: users users_referred_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_id_fkey FOREIGN KEY (referred_by_id) REFERENCES public.users(id);


--
-- TOC entry 5027 (class 2606 OID 16887)
-- Name: vip_daily_tasks vip_daily_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_daily_tasks
    ADD CONSTRAINT vip_daily_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5028 (class 2606 OID 16892)
-- Name: vip_daily_tasks vip_daily_tasks_vip_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_daily_tasks
    ADD CONSTRAINT vip_daily_tasks_vip_purchase_id_fkey FOREIGN KEY (vip_purchase_id) REFERENCES public.vip_purchases(id) ON DELETE CASCADE;


--
-- TOC entry 5025 (class 2606 OID 16851)
-- Name: vip_purchases vip_purchases_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_purchases
    ADD CONSTRAINT vip_purchases_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.vip_packages(id);


--
-- TOC entry 5026 (class 2606 OID 16846)
-- Name: vip_purchases vip_purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vip_purchases
    ADD CONSTRAINT vip_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5017 (class 2606 OID 16655)
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5020 (class 2606 OID 16758)
-- Name: withdrawals withdrawals_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- TOC entry 5021 (class 2606 OID 16728)
-- Name: withdrawals withdrawals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2026-05-08 23:41:57

--
-- PostgreSQL database dump complete
--

\unrestrict W0Xz3QUrkNCQizvPzO3RaXL5dywaMBW2bUMri1pscf7ke0Caaf6yKwHRQo9EbBh

