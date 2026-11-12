<?php

$entries_updated[] = "";

include (DB.'BBOtables.db.php');

//echo "Post=", var_dump($_POST), "<br><br>;";
//echo '<pre>';
//var_dump($_SESSION);
//echo '</pre>';
//echo '<pre>';
//var_dump($_SESSION["user_name"]);
//echo '</pre>';


/*
Here are the tests for an entry.
1. Does the entry number exist in the brewing table
2. Has this entry already been assigned a judging number. Determined by the judging number being less than or equal to 9999
3. Has the judging number already been assigned to another entry
4. Has this entry already been received by looking at the received column in the brewing table
5. Does the table from the entry form match the what the entry has in the database?

We propagate the brewPaid value from the database back into the database

*/

foreach ($_POST['id'] as $id) {

	$skip_update = 0;

	if ($_POST['eid'.$id] != "") {

		$judging_number = number_pad($_POST['judgingNumber'.$id],6);

		// Check to see if the entry number exists and get judgingNumber and paid flag
		$stmt_enum = mysqli_prepare($connection, sprintf("SELECT brewJudgingNumber, brewPaid, brewReceived FROM %s WHERE id=?", $prefix."brewing")) or die("A database error occurred.");
		mysqli_stmt_bind_param($stmt_enum, "s", $_POST['eid'.$id]);
		mysqli_stmt_execute($stmt_enum);
		$enum = mysqli_stmt_get_result($stmt_enum);
		$row_enum = mysqli_fetch_assoc($enum);
		$totalRows_enum = mysqli_num_rows($enum);

		// If there is no row in the brewing table, no need to look further.
		if ($totalRows_enum > 0) {

			// Convert DB NULL to zero in the variable
			if (is_null($row_enum['brewReceived'])) {$row_enum['brewReceived'] = 0;}

			// Check to see if the judging number has already been used and if so, flag it
			$stmt_jnum = mysqli_prepare($connection, sprintf("SELECT COUNT(*) AS 'count' FROM %s WHERE brewJudgingNumber=?", $prefix."brewing")) or die("A database error occurred.");
			mysqli_stmt_bind_param($stmt_jnum, "s", $judging_number);
			mysqli_stmt_execute($stmt_jnum);
			$jnum = mysqli_stmt_get_result($stmt_jnum);
			$row_jnum = mysqli_fetch_assoc($jnum);

			// Get Table Number to match against entry form
			// Get Category and Subcategory from the brewing table
			// Then use the $BBOTables variable to look up the Table this entry is in.
			$stmt_styleid_in_DB = mysqli_prepare($connection, sprintf("SELECT brewCategorySort, brewSubCategory FROM %s WHERE id = ?", $prefix."brewing")) or die("A database error occurred.");
			mysqli_stmt_bind_param($stmt_styleid_in_DB, "s", $_POST['eid'.$id]);
			mysqli_stmt_execute($stmt_styleid_in_DB);
			$style_in_DB = mysqli_stmt_get_result($stmt_styleid_in_DB);
			$row_style_in_DB = mysqli_fetch_assoc($style_in_DB);

			$row_table = $BBOTables['TableStyles']['TableNumber'][$row_style_in_DB['brewCategorySort'] . '-' . $row_style_in_DB['brewSubCategory']];
		}

		if ($totalRows_enum == 0) { // 1. Does the entry number exist in the brewing table?
			$flag_enum_not_found[] = $_POST['eid'.$id];
			$errortext = sprintf("1# The following entry number was not found: %s", $_POST['eid'.$id]);
			$stmt_log = mysqli_prepare($connection, sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES (?, ?, ?)", $prefix."barcode_log")) or die("A database error occurred.");
			mysqli_stmt_bind_param($stmt_log, "sss", $_SESSION["user_name"], $_POST['eid'.$id], $errortext);
			mysqli_stmt_execute($stmt_log);
			$skip_update = 1;
		}
		elseif (intval($row_enum['brewJudgingNumber']) <= 9999) { // 2. Has the judging number already been updated?
			$flag_entry_prev_assigned_jnum[] = $row_enum['brewJudgingNumber']."*".$_POST['eid'.$id]."*".$judging_number;
			$errortext = sprintf("2# Entry %s has already been assigned judging number %s, you tried to assign %s", $_POST['eid'.$id], $row_enum['brewJudgingNumber'], $judging_number);
			$stmt_log = mysqli_prepare($connection, sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES (?, ?, ?)", $prefix."barcode_log")) or die("A database error occurred.");
			mysqli_stmt_bind_param($stmt_log, "sss", $_SESSION["user_name"], $_POST['eid'.$id], $errortext);
			mysqli_stmt_execute($stmt_log);
			$skip_update = 1;
		}
		elseif ($row_jnum['count'] > 0) { // 3. Has the judging number already been assigned to another entry?
			$flag_jnum_assign_other_entry[] = $judging_number."*".$_POST['eid'.$id];
			$errortext = sprintf("3# Entry: %s, you tried to assign judging number: %s but it was already assigned to different entry.", $_POST['eid'.$id], $judging_number);
			$stmt_log = mysqli_prepare($connection, sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES (?, ?, ?)", $prefix."barcode_log")) or die("A database error occurred.");
			mysqli_stmt_bind_param($stmt_log, "sss", $_SESSION["user_name"], $_POST['eid'.$id], $errortext);
			mysqli_stmt_execute($stmt_log);
			$skip_update = 1;
		}
		elseif ($row_enum['brewReceived'] == 1) { // 4. Has the entry already been received?
		  $flag_enum_already_received[] = $_POST['eid'.$id];

		  $errortext = sprintf("4# The following entry already received in database: %s", $_POST['eid'.$id]);
			$stmt_log = mysqli_prepare($connection, sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES (?, ?, ?)", $prefix."barcode_log")) or die("A database error occurred.");
			mysqli_stmt_bind_param($stmt_log, "sss", $_SESSION["user_name"], $_POST['eid'.$id], $errortext);
			mysqli_stmt_execute($stmt_log);
			$skip_update = 1;
		}
		elseif (intval($_POST['tableNumber'.$id]) != $row_table) // 5. Does the table number on the entry form match the database?
		  {
		    $mismatch_table[] = $row_table . "*" . $_POST['eid'.$id] . "*" . $_POST['tableNumber'.$id];

		    $errortext = sprintf("5# Entry %s table mismatch, Entry sheet says %s, DB says %s", $_POST['eid'.$id], $_POST['tableNumber'.$id], $row_table);
			$stmt_log = mysqli_prepare($connection, sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES (?, ?, ?)", $prefix."barcode_log")) or die("A database error occurred.");
			mysqli_stmt_bind_param($stmt_log, "sss", $_SESSION["user_name"], $_POST['eid'.$id], $errortext);
			mysqli_stmt_execute($stmt_log);
		    $skip_update = 1;
		  }


		if ($totalRows_enum > 0) {

			if ($skip_update == 0) {

				$eid = ltrim($_POST['eid'.$id],"0");

				$entries_updated[] = number_pad($_POST['eid'.$id],4);


				if ((isset($_POST['brewPaid'.$id])) && ($_POST['brewPaid'.$id] == 1)) $brewPaid = 1; else $brewPaid = $row_enum['brewPaid'];


				$stmt_update = mysqli_prepare($connection, sprintf("UPDATE %s SET brewReceived='1', brewJudgingNumber=?, brewBoxNum=?, brewPaid=? WHERE id=?", $brewing_db_table)) or die("A database error occurred.");
				mysqli_stmt_bind_param($stmt_update, "ssss", $judging_number, $_POST['box'.$id], $brewPaid, $eid);
				mysqli_stmt_execute($stmt_update);

			}
		}
	}
}

$entry_list .= display_array_content($entries_updated,2);

?>
