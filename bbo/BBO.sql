CREATE TABLE `brewing_bbo_real` (
  `id` int(11) NOT NULL,
  `brewName` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewStyle` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewCategory` varchar(4) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewCategorySort` varchar(4) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewSubCategory` varchar(4) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewBottleDate` date DEFAULT NULL,
  `brewDate` date DEFAULT NULL,
  `brewYield` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewInfo` mediumtext COLLATE utf8mb4_unicode_ci,
  `brewMead1` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewMead2` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewMead3` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewComments` mediumtext COLLATE utf8mb4_unicode_ci,
  `brewBrewerID` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'id from brewer table',
  `brewBrewerFirstName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewBrewerLastName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewPaid` tinyint(1) DEFAULT NULL COMMENT '1=true; 0=false',
  `brewWinner` char(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewWinnerCat` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewInfoOptional` text COLLATE utf8mb4_unicode_ci,
  `brewAdminNotes` tinytext COLLATE utf8mb4_unicode_ci COMMENT 'Notes about the entry for Admin use',
  `brewStaffNotes` tinytext COLLATE utf8mb4_unicode_ci COMMENT 'Notes about the entry for Staff use',
  `brewPossAllergens` tinytext COLLATE utf8mb4_unicode_ci COMMENT 'Notes about the entry from entrant about possible allergens',
  `brewReceived` tinyint(1) DEFAULT NULL COMMENT '1=true; 0=false',
  `brewJudgingLocation` int(8) DEFAULT NULL,
  `brewCoBrewer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewJudgingNumber` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brewUpdated` timestamp NULL DEFAULT NULL COMMENT 'Timestamp of when the entry was last updated',
  `brewConfirmed` tinyint(1) DEFAULT NULL COMMENT '1=true - 2=false',
  `brewBoxNum` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bboLogicallyDeleted` tinyint(1) NOT NULL DEFAULT '0',
  `bboLogicallyDeletedTime` timestamp NULL DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `brewing_bbo_real`
  ADD PRIMARY KEY (`id`);
  
ALTER TABLE `brewing_bbo_real`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1001;

--
-- Structure for view `brewing`
--
DROP TABLE IF EXISTS `brewing`;

CREATE VIEW `brewing`  AS SELECT `brewing_bbo_real`.`id` AS `id`, `brewing_bbo_real`.`brewName` AS `brewName`, `brewing_bbo_real`.`brewStyle` AS `brewStyle`, `brewing_bbo_real`.`brewCategory` AS `brewCategory`, `brewing_bbo_real`.`brewCategorySort` AS `brewCategorySort`, `brewing_bbo_real`.`brewSubCategory` AS `brewSubCategory`, `brewing_bbo_real`.`brewBottleDate` AS `brewBottleDate`, `brewing_bbo_real`.`brewDate` AS `brewDate`, `brewing_bbo_real`.`brewYield` AS `brewYield`, `brewing_bbo_real`.`brewInfo` AS `brewInfo`, `brewing_bbo_real`.`brewMead1` AS `brewMead1`, `brewing_bbo_real`.`brewMead2` AS `brewMead2`, `brewing_bbo_real`.`brewMead3` AS `brewMead3`, `brewing_bbo_real`.`brewComments` AS `brewComments`, `brewing_bbo_real`.`brewBrewerID` AS `brewBrewerID`, `brewing_bbo_real`.`brewBrewerFirstName` AS `brewBrewerFirstName`, `brewing_bbo_real`.`brewBrewerLastName` AS `brewBrewerLastName`, `brewing_bbo_real`.`brewPaid` AS `brewPaid`, `brewing_bbo_real`.`brewWinner` AS `brewWinner`, `brewing_bbo_real`.`brewWinnerCat` AS `brewWinnerCat`, `brewing_bbo_real`.`brewInfoOptional` AS `brewInfoOptional`, `brewing_bbo_real`.`brewAdminNotes` AS `brewAdminNotes`, `brewing_bbo_real`.`brewStaffNotes` AS `brewStaffNotes`, `brewing_bbo_real`.`brewPossAllergens` AS `brewPossAllergens`, `brewing_bbo_real`.`brewReceived` AS `brewReceived`, `brewing_bbo_real`.`brewJudgingLocation` AS `brewJudgingLocation`, `brewing_bbo_real`.`brewCoBrewer` AS `brewCoBrewer`, `brewing_bbo_real`.`brewJudgingNumber` AS `brewJudgingNumber`, `brewing_bbo_real`.`brewUpdated` AS `brewUpdated`, `brewing_bbo_real`.`brewConfirmed` AS `brewConfirmed`, `brewing_bbo_real`.`brewBoxNum` AS `brewBoxNum` FROM `brewing_bbo_real` WHERE (`brewing_bbo_real`.`bboLogicallyDeleted` = 0) ;