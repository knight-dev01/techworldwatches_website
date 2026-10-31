-- ============================================================
--  TECH WORLD WATCHES — MySQL / MariaDB import file
-- ------------------------------------------------------------
--  XAMPP (phpMyAdmin):
--    1. Start Apache and MySQL in the XAMPP Control Panel.
--    2. Open http://localhost/phpmyadmin
--    3. Click "Import", choose this file, then "Go".
--
--  Command line (Windows cmd, with XAMPP MySQL on PATH):
--    mysql -u root < techworld_watches.sql
--
--  This file creates the database `techworld_watches`, then drops and
--  re-creates the `watches` table with the 6 starter watches. Re-importing
--  it replaces the MySQL copy with the contents of this file.
-- ============================================================

CREATE DATABASE IF NOT EXISTS techworld_watches
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE techworld_watches;

SET NAMES utf8mb4;

DROP TABLE IF EXISTS watches;

CREATE TABLE watches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  price INT UNSIGNED NOT NULL,
  image VARCHAR(255) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'luxury',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO watches (name, price, image, category) VALUES
  ('Rolex Submariner',          85000, 'assets/watch-1.jpg', 'luxury'),
  ('Apple Watch Ultra 2',      120000, 'assets/watch-2.jpg', 'smart'),
  ('Casio G-Shock GA-2100',     45000, 'assets/watch-3.jpg', 'sport'),
  ('Patek Philippe Nautilus',  250000, 'assets/watch-4.jpg', 'luxury'),
  ('Omega Seamaster',           95000, 'assets/watch-5.jpg', 'luxury'),
  ('Audemars Piguet Royal Oak',180000, 'assets/watch-6.jpg', 'luxury');
