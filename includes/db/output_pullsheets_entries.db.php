<?php
/*
if (HOSTED) $styles_db_table = "bcoem_shared_styles";
else
*/
$styles_db_table = $prefix."styles";

/*
if (HOSTED) $query_styles = sprintf("SELECT brewStyleGroup,brewStyleNum FROM %s WHERE id='%s' UNION ALL SELECT brewStyleGroup,brewStyleNum FROM %s WHERE id='%s'", $styles_db_table, $value, $prefix."styles", $value);
else 
*/
$db_conn->where('id', $value);
$row_styles = $db_conn->getOne($styles_db_table, "brewStyleGroup,brewStyleNum");

// Mini-BOS Pullsheets (by Table or Category)
// Unified Mini-BOS query housed in /includes/db/output_pullsheets_mini_bos.db.php
if ($filter == "mini_bos") {

	// $order is restricted to 2 hardcoded literal column names above, never user input - safe to splice as identifier text
	if ($view == "default") $order = "b.brewJudgingNumber";
	else $order = "b.id";

	$query_entries = "SELECT a.scoreMiniBOS, b.id, b.brewStyle, b.brewCategory, b.brewCategorySort, b.brewSubCategory, b.brewInfo, b.brewMead1, b.brewMead2, b.brewMead3, b.brewJudgingNumber, b.brewBoxNum, b.brewComments, b.brewInfoOptional, b.brewPossAllergens, b.brewStaffNotes, b.brewABV, b.brewJuiceSource, b.brewSweetnessLevel, b.brewPouring, b.brewStyleType, b.brewPackaging FROM ".$prefix."judging_scores"." a, ".$prefix."brewing"." b WHERE b.brewCategorySort=? AND b.brewSubCategory=? AND a.eid = b.id AND a.scoreMiniBOS='1' ORDER BY ".$order;
	$params_entries = array($row_styles['brewStyleGroup'], $row_styles['brewStyleNum']);

}

// All Other Pullsheets
else {

	// $order is restricted to 2 hardcoded literal column names above, never user input - safe to splice as identifier text
	if ($view == "default") $order = "brewJudgingNumber";
	else $order = "id";

	$received = TRUE;
	if ($view == "judge_inventory") {
		if ($_SESSION['jPrefsTablePlanning'] == 1) $received = FALSE;
	}

	$query_entries = "SELECT * FROM ".$prefix."brewing"." WHERE brewCategorySort=? AND brewSubCategory=?";
	$params_entries = array($row_styles['brewStyleGroup'], $row_styles['brewStyleNum']);

	if ($received) $query_entries .= " AND brewReceived='1'";
	$query_entries .= " ORDER BY ".$order." ASC";

}

// $entries must remain a real mysqli_result (not a MysqliDb array) because
// output/pullsheets.output.php consumes it afterward via its own
// `while ($row_entries = mysqli_fetch_assoc($entries))` loop - outside this task's
// assigned file list, so the producer's external contract is preserved exactly.
// Still fully parameterized via mysqli_prepare/bind_param.
$stmt_entries = mysqli_prepare($connection, $query_entries);
$types_entries = str_repeat("s", count($params_entries));
mysqli_stmt_bind_param($stmt_entries, $types_entries, ...$params_entries);
mysqli_stmt_execute($stmt_entries);
$entries = mysqli_stmt_get_result($stmt_entries);
$row_entries = mysqli_fetch_assoc($entries);
$totalRows_entries = mysqli_num_rows($entries);
?>