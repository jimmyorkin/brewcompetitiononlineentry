<?php

/**
 This file is shared with two scripts:
 includes/process/process_brewer.inc.php
 includes/process/process_users_registration.inc.php
 */

// Instantiate HTMLPurifier
require (CLASSES.'htmlpurifier/HTMLPurifier.standalone.php');
$config_html_purifier = HTMLPurifier_Config::createDefault();
$purifier = new HTMLPurifier($config_html_purifier);

// Gather, convert, and/or sanitize info from the form
if (isset($_POST['brewerJudgeID'])) {
    $brewerJudgeID = $purifier->purify($_POST['brewerJudgeID']);
    $brewerJudgeID = strtoupper($brewerJudgeID);
}
else $brewerJudgeID = "";

if (isset($_POST['brewerJudgeMead'])) $brewerJudgeMead = $_POST['brewerJudgeMead'];
else $brewerJudgeMead = "";

if (isset($_POST['brewerJudgeCider'])) $brewerJudgeCider = $_POST['brewerJudgeCider'];
else $brewerJudgeCider = "";

if (isset($_POST['brewerJudgeRank'])) $brewerJudgeRank = $_POST['brewerJudgeRank'];
else $brewerJudgeRank = "";

if (isset($_POST['brewerAHA'])) $brewerAHA = sterilize($_POST['brewerAHA']);
else $brewerAHA = "";

if (isset($_POST['brewerProAm'])) $brewerProAm = $_POST['brewerProAm'];
else $brewerProAm = "";

if (isset($_POST['brewerClubs'])) {
    include (DB.'entries.db.php');
    include (INCLUDES.'constants.inc.php');
    $brewerClubs = $purifier->purify($_POST['brewerClubs']);
    $brewerClubsConcat = $brewerClubs."|".$brewerClubs;
    if (!in_array($brewerClubsConcat,$club_array)) {
        if ($_POST['brewerClubs'] == "Other") {
            if (!empty($_POST['brewerClubsOther'])) $brewerClubs = ucwords($purifier->purify($_POST['brewerClubsOther']));
            else $brewerClubs = "Other";
        }
        else $brewerClubs = "";
    }
    else $brewerClubs = $brewerClubs;
}
else $brewerClubs = "";

if (isset($_POST['brewerPhone1'])) $brewerPhone1 = sterilize($_POST['brewerPhone1']);
else $brewerPhone1 = "";

if (isset($_POST['brewerPhone2'])) $brewerPhone2 = sterilize($_POST['brewerPhone2']);
else $brewerPhone2 = "";

if (isset($_POST['brewerJudgeWaiver'])) $brewerJudgeWaiver = $_POST['brewerJudgeWaiver'];
else $brewerJudgeWaiver = "";

if (isset($_POST['brewerDropOff'])) $brewerDropOff = sterilize($_POST['brewerDropOff']);
else $brewerDropOff = "0";

if (isset($_POST['brewerBreweryName'])) $brewerBreweryName = standardize_name($purifier->purify($_POST['brewerBreweryName']));
else $brewerBreweryName = "";

if (isset($_POST['brewerBreweryTTB'])) {
    $brewerBreweryTTB = $purifier->purify($_POST['brewerBreweryTTB']);
    $brewerBreweryTTB = strtoupper($brewerBreweryTTB);
}
else $brewerBreweryTTB = "";

if (isset($_POST['brewerJudge'])) $brewerJudge = $_POST['brewerJudge'];
else $brewerJudge = "N";

if (isset($_POST['brewerSteward'])) $brewerSteward = $_POST['brewerSteward'];
else $brewerSteward = "N";

if (($_SESSION['prefsProEdition'] == 1) && ($go == "entrant")) {
    $brewerJudge = "N";
    $brewerSteward = "N";
}

if (isset($_POST['brewerStaff'])) $brewerStaff = $_POST['brewerStaff'];
else $brewerStaff = "";

if (isset($_POST['brewerJudgeExp'])) $brewerJudgeExp = $_POST['brewerJudgeExp'];
else $brewerJudgeExp = "";

if (isset($_POST['brewerJudgeNotes'])) $brewerJudgeNotes = $purifier->purify($_POST['brewerJudgeNotes']);
else $brewerJudgeNotes = "";

/*
 * Address GitHub Issue #1113 - https://github.com/geoffhumphrey/brewcompetitiononlineentry/issues/1113
 * Table assignments not updating if a user or admin indicates they are not
 * available for a particular judging session.
 * Need to search through array of location availablities for any that are "N"
 * and search for the corresponding location/uid combo in the judging_assignments 
 * table and delete the records.
 */

if ($brewerJudge == "Y") {
    
    if (($_POST['brewerJudgeLocation'] != "") && (is_array($_POST['brewerJudgeLocation']))) {
        
        foreach ($_POST['brewerJudgeLocation'] as $value) {
            
            $loc = explode("-",$value);
            
            if ($loc[0] == "N") {
                
                if ($go == "admin") $id = $filter;
                else $id = $id;
                $updateSQL = sprintf("DELETE FROM %s WHERE bid='%s' AND assignment='J' AND assignLocation='%s'",$prefix."judging_assignments",$id,$loc[1]);
                //echo $updateSQL."<br>";
                mysqli_real_escape_string($connection,$updateSQL);
                $result = mysqli_query($connection,$updateSQL) or die (mysqli_error($connection));

            }
        }

        $location_pref1 = sterilize(implode(",",$_POST['brewerJudgeLocation']));
    }

    elseif (($_POST['brewerJudgeLocation'] != "") && (!is_array($_POST['brewerJudgeLocation']))) {

        $loc = explode("-",$_POST['brewerJudgeLocation']);

        if ($loc[0] == "N") {
            
            if ($go == "admin") $id = $filter;
            else $id = $id;
            
            $updateSQL = sprintf("DELETE FROM %s WHERE bid='%s' AND assignment='J' AND assignLocation='%s'",$prefix."judging_assignments",$id,$loc[1]);
            mysqli_real_escape_string($connection,$updateSQL);
            $result = mysqli_query($connection,$updateSQL) or die (mysqli_error($connection));

        }

        $location_pref1 = sterilize($_POST['brewerJudgeLocation']);
    }
}

if ($brewerJudge == "N") {

    if ($go == "admin") $id = $filter;
    else $id = $id;

    $updateSQL = sprintf("DELETE FROM %s WHERE bid='%s' AND assignment='J'",$prefix."judging_assignments",$id);
    mysqli_real_escape_string($connection,$updateSQL);
    $result = mysqli_query($connection,$updateSQL) or die (mysqli_error($connection));
    $location_pref1 = "";

}

if ($brewerSteward == "Y") {
    
    if (($_POST['brewerStewardLocation'] != "") && (is_array($_POST['brewerStewardLocation']))) {

        foreach ($_POST['brewerStewardLocation'] as $value) {
            $loc = explode("-",$value);
            if ($loc[0] == "N") {
                if ($go == "admin") $id = $filter;
                else $id = $id;
                $updateSQL = sprintf("DELETE FROM %s WHERE bid='%s' AND assignment='S' AND assignLocation='%s'",$prefix."judging_assignments",$id,$loc[1]);
                mysqli_real_escape_string($connection,$updateSQL);
                $result = mysqli_query($connection,$updateSQL) or die (mysqli_error($connection));
            }
        }

        $location_pref2 = sterilize(implode(",",$_POST['brewerStewardLocation']));
    }


    elseif (($_POST['brewerStewardLocation'] != "") && (!is_array($_POST['brewerStewardLocation']))) {

        $loc = explode("-",$_POST['brewerStewardLocation']);

        if ($loc[0] == "N") {
            if ($go == "admin") $id = $filter;
            else $id = $id;
            $updateSQL = sprintf("DELETE FROM %s WHERE bid='%s' AND assignment='S' AND assignLocation='%s'",$prefix."judging_assignments",$id,$loc[1]);
            mysqli_real_escape_string($connection,$updateSQL);
            $result = mysqli_query($connection,$updateSQL) or die (mysqli_error($connection));
        }

        $location_pref2 = sterilize($_POST['brewerStewardLocation']);

    }

}

if ($brewerSteward == "N") { 

    if ($go == "admin") $id = $filter;
    else $id = $id;

    $updateSQL = sprintf("DELETE FROM %s WHERE bid='%s' AND assignment='S'",$prefix."judging_assignments",$id);
    mysqli_real_escape_string($connection,$updateSQL);
    $result = mysqli_query($connection,$updateSQL) or die (mysqli_error($connection));

    $location_pref2 = "";

}

if (isset($_POST['brewerJudgeLikes'])) {
    if (is_array($_POST['brewerJudgeLikes'])) $likes = implode(",",$_POST['brewerJudgeLikes']);
    else $likes = $_POST['brewerJudgeLikes'];
    $likes = sterilize($likes);
}
else $likes = "";

if (isset($_POST['brewerJudgeDislikes'])) {
    if (is_array($_POST['brewerJudgeDislikes'])) $dislikes = implode(",",$_POST['brewerJudgeDislikes']);
    else $dislikes = $_POST['brewerJudgeDislikes'];
    $dislikes = sterilize($dislikes);
}
else $dislikes = "";

if (isset($brewerJudgeRank)) {
    if (is_array($brewerJudgeRank)) $rank = implode(",",$brewerJudgeRank);
    else $rank = $brewerJudgeRank;
    $rank = sterilize($rank);
}
else $rank = "";

$first_name = standardize_name($purifier->purify($_POST['brewerFirstName']));
$last_name = standardize_name($purifier->purify($_POST['brewerLastName']));
$address = standardize_name($purifier->purify($_POST['brewerAddress']));
$city = standardize_name($purifier->purify($_POST['brewerCity']));
$state = $purifier->purify($_POST['brewerState']);
if (strlen($state) > 2) $state = standardize_name($state);
else $state = strtoupper($state);

?>