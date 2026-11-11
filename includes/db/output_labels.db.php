<?php
// ---------------------------------------------------------
// Entry Data Labels
// ---------------------------------------------------------

if ($go == "entries") {

	$params_log = array();

	if ($action == "bottle-entry") {

		$query_log = "SELECT * FROM ".$prefix."brewing";
		if ($filter == "default") {
			if ($tb == "received") $query_log .= " WHERE brewReceived='1'";
		}
		else {
			$query_log .= " WHERE brewCategorySort=?";
			$params_log[] = $filter;
			if ($tb == "received") $query_log .= " AND brewReceived='1'";
		}
		$query_log .= " ORDER BY brewCategorySort,brewSubCategory,id ASC";

	}

	if ($action == "bottle-judging") {

		$query_log = "SELECT * FROM ".$prefix."brewing";
		if ($filter == "default") {
			if ($tb == "received") $query_log .= " WHERE brewReceived='1'";
		}
		else {
			$query_log .= " WHERE brewCategorySort=?";
			$params_log[] = $filter;
			if ($tb == "received") $query_log .= " AND brewReceived='1'";
		}
		$query_log .= " ORDER BY brewCategorySort,brewSubCategory,brewJudgingNumber ASC";

	}

	if (($action == "bottle-judging-round") && ($view == "default")) {
		$query_log = "SELECT * FROM ".$prefix."brewing";
		//if ($filter != "default") $query_log .= sprintf(" WHERE brewCategorySort='%s'",$filter);
		$query_log .= " ORDER BY brewCategorySort,brewSubCategory,brewJudgingNumber ASC";

	}

	if (($action == "bottle-entry-round") && ($view == "default")) {

		$query_log = "SELECT * FROM ".$prefix."brewing";
		//if ($filter != "default") $query_log .= sprintf(" WHERE brewCategorySort='%s'",$filter);
		$query_log .= " ORDER BY brewCategorySort,brewSubCategory,id ASC";

	}

	if (($action == "bottle-category-round") && ($view == "default")) {

		$query_log = "SELECT brewCategorySort,brewSubCategory FROM ".$prefix."brewing"." ORDER BY brewCategorySort,brewSubCategory ASC";
		if ($filter != "default") { $query_log .= " WHERE brewCategorySort=?"; $params_log[] = $filter; }

	}

	if (($action == "bottle-entry-round") && ($view == "OL5275WR")) {

		$query_log = "SELECT * FROM ".$prefix."brewing";
		if ($filter != "default") { $query_log .= " WHERE brewCategorySort=?"; $params_log[] = $filter; }
		$query_log .= " ORDER BY brewCategorySort,brewSubCategory,id ASC";

	}


	// Execute query
	// $log must remain a real mysqli_result (not a MysqliDb array) because
	// output/labels.output.php consumes it afterward via several of its own
	// `while ($row_log = mysqli_fetch_assoc($log))` loops - outside this task's
	// assigned file list, so the producer's external contract is preserved exactly.
	// Still fully parameterized via mysqli_prepare/bind_param.
	$stmt_log = mysqli_prepare($connection, $query_log);
	if (!empty($params_log)) {
		$types_log = str_repeat("s", count($params_log));
		mysqli_stmt_bind_param($stmt_log, $types_log, ...$params_log);
	}
	mysqli_stmt_execute($stmt_log);
	$log = mysqli_stmt_get_result($stmt_log);
	$row_log = mysqli_fetch_assoc($log);
	$totalRows_log = mysqli_num_rows($log);

}

// ---------------------------------------------------------
// Participant Data Labels
// ---------------------------------------------------------

if ($go == "participants") {

	$params_brewer = array();

	if ($action == "judging_nametags") {

		$query_brewer = "SELECT a.id,a.brewerFirstName,a.brewerLastName,a.brewerCity,a.brewerState,b.uid,b.staff_judge,b.staff_steward,b.staff_staff,b.staff_organizer FROM ".$prefix."brewer"." a, ".$prefix."staff"." b WHERE a.uid = b.uid ORDER BY a.brewerLastName ASC";

	}

	if (($action == "judging_labels") && ($id == "default")) {

		$query_brewer = "SELECT a.id,a.brewerFirstName,a.brewerLastName,a.brewerJudgeID,a.brewerEmail,a.brewerJudgeRank,a.brewerJudgeMead,b.uid,b.staff_judge FROM ".$prefix."brewer"." a, ".$prefix."staff"." b WHERE a.uid = b.uid AND b.staff_judge='1' AND a.brewerJudge = 'Y' ORDER BY a.brewerLastName ASC";

	}

	if (($action == "judging_labels") && ($id != "default")) {

		$query_brewer = "SELECT id,brewerFirstName,brewerLastName,brewerJudgeID,brewerEmail,brewerJudgeRank,brewerJudgeMead,uid FROM ".$prefix."brewer"." WHERE id = ?";
		$params_brewer[] = $id;

	}

	if ($action == "address_labels") {

		$query_brewer = "SELECT * FROM ".$prefix."brewer"." ORDER BY brewerLastName ASC";

		if ($filter == "with_entries") {
			// $with_entries must remain a real mysqli_result because
			// output/labels.output.php consumes it via its own
			// `while ($row_with_entries = mysqli_fetch_assoc($with_entries))` loop.
			$query_with_entries = "SELECT brewBrewerID FROM ".$brewing_db_table." WHERE brewReceived=?";
			$stmt_with_entries = mysqli_prepare($connection, $query_with_entries);
			$received_flag = "1";
			mysqli_stmt_bind_param($stmt_with_entries, "s", $received_flag);
			mysqli_stmt_execute($stmt_with_entries);
			$with_entries = mysqli_stmt_get_result($stmt_with_entries);
			$row_with_entries = mysqli_fetch_assoc($with_entries);
		}
	}

	// Execute the query
	// $brewer must remain a real mysqli_result (not a MysqliDb array) because
	// output/labels.output.php consumes it afterward via several of its own
	// `while ($row_brewer = mysqli_fetch_assoc($brewer))` loops - outside this task's
	// assigned file list, so the producer's external contract is preserved exactly.
	// Still fully parameterized via mysqli_prepare/bind_param.
	$stmt_brewer = mysqli_prepare($connection, $query_brewer);
	if (!empty($params_brewer)) {
		$types_brewer = str_repeat("s", count($params_brewer));
		mysqli_stmt_bind_param($stmt_brewer, $types_brewer, ...$params_brewer);
	}
	mysqli_stmt_execute($stmt_brewer);
	$brewer = mysqli_stmt_get_result($stmt_brewer);
	$row_brewer = mysqli_fetch_assoc($brewer);
	$totalRows_brewer = mysqli_num_rows($brewer);
}

// ---------------------------------------------------------
// Score and Result Data Labels
// ---------------------------------------------------------
?>