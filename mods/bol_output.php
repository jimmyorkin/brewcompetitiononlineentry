<?php 
//session_start(); 
require('../paths.php');
require(INCLUDES.'url_variables.inc.php');
require(DB.'common.db.php');
include(INCLUDES.'version.inc.php');
include(INCLUDES.'headers.inc.php');
include(INCLUDES.'scrubber.inc.php');
require(LIB.'date_time.lib.php');

$checkin_loc = "Check in";

mysqli_select_db($connection,$database);

$query_contest_info = sprintf("SELECT * FROM %s WHERE id=1",$prefix."contest_info");
$row_contest_info = mysqli_query($connection, $query_contest_info) or die(mysqli_error($connection));
$contest_info = mysqli_fetch_assoc($row_contest_info);

$query_checkin_info = sprintf("SELECT * FROM %s WHERE judgingLocName='%s'",$prefix."judging_locations",$checkin_loc);
$row_checkin_info = mysqli_query($connection,$query_checkin_info) or die(mysqli_error($connection));
$checkin_info = mysqli_fetch_assoc($row_checkin_info);
$seconddrop = $checkin_info['judgingLocation'];

$entrydate   = getTimeZoneDateTime($_SESSION['prefsTimeZone'], $contest_info['contestEntryDeadline'], $_SESSION['prefsDateFormat'],  $_SESSION['prefsTimeFormat'], "short", "date");
$checkindate = getTimeZoneDateTime($_SESSION['prefsTimeZone'], $checkin_info['judgingDate'], $_SESSION['prefsDateFormat'],  $_SESSION['prefsTimeFormat'], "short", "date");

if (($bid == "default")&&($_SESSION['userLevel'] <= 1)) {
	$query_brewer = sprintf("SELECT * FROM %s ORDER BY brewerLastName, brewerFirstName", $prefix."brewer",$bid);
} else {
	$query_brewer = sprintf("SELECT * FROM %s WHERE uid = '%s'", $prefix."brewer",$bid);
}
$brewer = mysqli_query($connection,$query_brewer) or die(mysql_error($connection));
$brewer_info = mysqli_fetch_assoc($brewer);

$query_prefs = sprintf("SELECT * FROM %s WHERE id=1",$prefix."preferences");
$prefs = mysqli_query($connection, $query_prefs) or die(mysql_error($connection));
$row_prefs = mysqli_fetch_assoc($prefs);

?>

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<?php if ($tb == "default") { ?><meta http-equiv="refresh" content="0;URL=<?php echo "http://".$_SERVER['SERVER_NAME'].$_SERVER['REQUEST_URI']."&tb=true"; ?>" /><?php } ?>
<title>BOL form-- <?php echo $contest_info['contestName']; ?></title>
<link href="../css/print.css" rel="stylesheet" type="text/css" />
<script type="text/javascript" language="javascript" src="https://ajax.googleapis.com/ajax/libs/jquery/1.6.2/jquery.min.js"></script>
<script type="text/javascript" language="javascript" src="../js_includes/jquery.dataTables.js"></script>

</head>
<body <?php if ($tb == "true") echo "onload=\"javascript:window.print()\""; ?>>

<p><font size=3>BOL Form-- <?php echo $contest_info['contestName']; ?></font><br>
<em>This form must accompany your entries</em></p>
<p>Event authorization on file with regional TABC office</p>

<p>Each line represents one competition entry</p>

<font size=1><table class="dataTable" width="100%">
  <tr>
    <td width="10%">Name</td>
    <td width="22%">Starting Address</td>
    <td width="14%">Style</td>
    <td width="22%">1st Drop Location</td>
    <td width="5%">Date</td>
	<td width="22%">2nd Drop Location</td>
    <td>Date</td>
  </tr>
<?php 
do { 
    if ($brewer_info['brewerDropOff']) {
    	$query_drop = sprintf ("SELECT * FROM %s WHERE id='%s'",$prefix."drop_off",$brewer_info['brewerDropOff']);
	    $drop = mysqli_query($connection,$query_drop) or die(mysql_error($connection));
	    $row_drop = mysqli_fetch_assoc($drop);
		$firstdrop = $row_drop['dropLocation'];
	} else {
		$firstdrop = $contest_info['contestShippingAddress'];
	}

	$query_brewing = sprintf("SELECT id, brewStyle, brewCategorySort, brewCategory, brewSubCategory FROM %s WHERE brewBrewerID = '%s' ORDER BY brewCategorySort, brewSubCategory", $prefix."brewing",$brewer_info['uid']);
	$log = mysqli_query($connection, $query_brewing) or die(mysql_error($connection));
	$brewing_info = mysqli_fetch_assoc($log);
	if (mysqli_num_rows($log) > 0) {
		do {?>
	<tr>
		<td><?php echo $brewer_info['brewerLastName'].", ".$brewer_info['brewerFirstName']; ?></td>
		<td><?php echo strtr($brewer_info['brewerAddress'],$html_remove)." ".strtr($brewer_info['brewerCity'],$html_remove)." ".strtr($brewer_info['brewerState'],$html_remove)." ".$brewer_info['brewerZip']; ?></td>
		<td><?php echo $brewing_info['brewCategory'].$brewing_info['brewSubCategory'].": ".$brewing_info['brewStyle']; ?></td>
		<td><?php echo $firstdrop; ?></td>
		<td><?php echo $entrydate; ?></td>
		<td><?php echo $seconddrop; ?></td>
		<td><?php echo $checkindate; ?></td>
	</tr>
<?php 
		}while ($brewing_info = mysqli_fetch_assoc($log));
	}
}while ($brewer_info = mysqli_fetch_assoc($brewer));
?>
</table></font>
 
</body>
</html>
