--
-- PostgreSQL database dump
--

-- Dumped from database version 12.3
-- Dumped by pg_dump version 12.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE ONLY discord.playlist_song DROP CONSTRAINT playlist_song_playlist_id_fkey;
ALTER TABLE ONLY discord.playlist_song DROP CONSTRAINT playlist_song_pkey;
ALTER TABLE ONLY discord.playlist DROP CONSTRAINT playlist_playlist_name_key;
ALTER TABLE ONLY discord.playlist DROP CONSTRAINT playlist_pkey;
ALTER TABLE discord.playlist ALTER COLUMN playlist_id DROP DEFAULT;
DROP TABLE discord.text_channel;
DROP TABLE discord.playlist_song;
DROP SEQUENCE discord.playlist_playlist_id_seq;
DROP TABLE discord.playlist;
DROP SCHEMA discord;
--
-- Name: discord; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA discord;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: playlist; Type: TABLE; Schema: discord; Owner: -
--

CREATE TABLE discord.playlist (
    playlist_id integer NOT NULL,
    playlist_name character varying(50) NOT NULL,
    created_by character(18) NOT NULL,
    created_date timestamp without time zone DEFAULT now()
);


--
-- Name: playlist_playlist_id_seq; Type: SEQUENCE; Schema: discord; Owner: -
--

CREATE SEQUENCE discord.playlist_playlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playlist_playlist_id_seq; Type: SEQUENCE OWNED BY; Schema: discord; Owner: -
--

ALTER SEQUENCE discord.playlist_playlist_id_seq OWNED BY discord.playlist.playlist_id;


--
-- Name: playlist_song; Type: TABLE; Schema: discord; Owner: -
--

CREATE TABLE discord.playlist_song (
    playlist_id integer NOT NULL,
    video_id character(11) NOT NULL,
    added_by character(18) NOT NULL
);


--
-- Name: text_channel; Type: TABLE; Schema: discord; Owner: -
--

CREATE TABLE discord.text_channel (
    text_channel_id character(18) NOT NULL,
    added_by character(18) NOT NULL
);


--
-- Name: playlist playlist_id; Type: DEFAULT; Schema: discord; Owner: -
--

ALTER TABLE ONLY discord.playlist ALTER COLUMN playlist_id SET DEFAULT nextval('discord.playlist_playlist_id_seq'::regclass);


--
-- Name: playlist playlist_pkey; Type: CONSTRAINT; Schema: discord; Owner: -
--

ALTER TABLE ONLY discord.playlist
    ADD CONSTRAINT playlist_pkey PRIMARY KEY (playlist_id);


--
-- Name: playlist playlist_playlist_name_key; Type: CONSTRAINT; Schema: discord; Owner: -
--

ALTER TABLE ONLY discord.playlist
    ADD CONSTRAINT playlist_playlist_name_key UNIQUE (playlist_name);


--
-- Name: playlist_song playlist_song_pkey; Type: CONSTRAINT; Schema: discord; Owner: -
--

ALTER TABLE ONLY discord.playlist_song
    ADD CONSTRAINT playlist_song_pkey PRIMARY KEY (playlist_id, video_id);


--
-- Name: playlist_song playlist_song_playlist_id_fkey; Type: FK CONSTRAINT; Schema: discord; Owner: -
--

ALTER TABLE ONLY discord.playlist_song
    ADD CONSTRAINT playlist_song_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES discord.playlist(playlist_id) ON DELETE CASCADE;


--
-- Name: SCHEMA discord; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA discord TO "discord-bot";


--
-- Name: TABLE playlist; Type: ACL; Schema: discord; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE discord.playlist TO "discord-bot";


--
-- Name: SEQUENCE playlist_playlist_id_seq; Type: ACL; Schema: discord; Owner: -
--

GRANT USAGE ON SEQUENCE discord.playlist_playlist_id_seq TO "discord-bot";


--
-- Name: TABLE playlist_song; Type: ACL; Schema: discord; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE discord.playlist_song TO "discord-bot";


--
-- Name: TABLE text_channel; Type: ACL; Schema: discord; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE discord.text_channel TO "discord-bot";


--
-- PostgreSQL database dump complete
--
