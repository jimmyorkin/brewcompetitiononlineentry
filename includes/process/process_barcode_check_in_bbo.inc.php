<?php

$entries_updated[] = "";

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
4. Has this entry already been recieved by looking at the received column in the brewing table
5. Does the table from the entry form match the what the entry has in the database?

We propagate the brewPaid value from the database back into the database

*/

foreach ($_POST['id'] as $id) {
  
	$skip_update = 0;
	
	if ($_POST['eid'.$id] != "") {
		
		$judging_number = number_pad($_POST['judgingNumber'.$id],6);

		// Check to see if the entry number exists and get judgingNumber and paid flag
		$query_enum = sprintf("SELECT brewJudgingNumber, brewPaid, brewReceived FROM %s WHERE id='%s'",$prefix."brewing",$_POST['eid'.$id]);
		$enum = mysqli_query($connection,$query_enum) or die (mysqli_error($connection));
		$row_enum = mysqli_fetch_assoc($enum);
		$totalRows_enum = mysqli_num_rows($enum);
		
		// If there is no row in the brewing table, no need to look further.
		if ($totalRows_enum > 0) {
		
			// Convert DB NULL to zero in the variable
			if (is_null($row_enum['brewReceived'])) {$row_enum['brewReceived'] = 0;}
	
			// Check to see if the judging number has already been used and if so, flag it
			$query_jnum = sprintf("SELECT COUNT(*) AS 'count' FROM %s WHERE brewJudgingNumber='%s'",$prefix."brewing",$judging_number);
			$jnum = mysqli_query($connection,$query_jnum) or die (mysqli_error($connection));
			$row_jnum = mysqli_fetch_assoc($jnum);
			
			// Get Table Number to match against entry form
			// First get id of style from brewing and style tables
			// Cheating here by hardcoding brewStyleVersion
			$query_styleid_in_DB = sprintf("SELECT a.id FROM %s a, %s b WHERE brewStyleGroup = brewCategorySort and brewStyleNum = brewSubCategory and brewStyleVersion = 'BJCP2021' AND b.id = %u", $prefix."styles", $prefix."brewing", $_POST['eid'.$id]);

			$styleid_in_DB = mysqli_query($connection,$query_styleid_in_DB) or die (mysqli_error($connection));
			$row_styleid_in_DB = mysqli_fetch_assoc($styleid_in_DB);
			
	    $likeString = "'%" . strval($row_styleid_in_DB['id']) . "%'";
			
	    // The get the table number from the table table
			$query_table = sprintf("SELECT tableNumber FROM %s WHERE tableStyles LIKE %s", $prefix."judging_tables", $likeString);

			$table = mysqli_query($connection,$query_table) or die (mysqli_error($connection));
			$row_table = mysqli_fetch_assoc($table);
		}
			
		if ($totalRows_enum == 0) { // 1. Does the entry number exist in the brewing table?
			$flag_enum_not_found[] = $_POST['eid'.$id];
			$insert_log_sql = sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES ('%s', '%s', '1# The following entry number was not found: %s');", $prefix."barcode_log", $_SESSION["user_name"], $_POST['eid'.$id], $_POST['eid'.$id]);
			mysqli_query($connection, $insert_log_sql) or die (mysqli_error($connection));
			$skip_update = 1;
		}
		elseif (intval($row_enum['brewJudgingNumber']) <= 9999) { // 2. Has the judging number already been updated?
			$flag_entry_prev_assigned_jnum[] = $row_enum['brewJudgingNumber']."*".$_POST['eid'.$id]."*".$judging_number;
			$insert_log_sql = sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES ('%s', '%s', '2# Entry %s has already been assigned judging number %s, you tried to assign %s');", 
			  $prefix."barcode_log", $_SESSION["user_name"], $_POST['eid'.$id], $_POST['eid'.$id], $row_enum['brewJudgingNumber'], $judging_number);
			mysqli_query($connection, $insert_log_sql) or die (mysqli_error($connection));
			$skip_update = 1;
		}
		elseif ($row_jnum['count'] > 0) { // 3. Has the judging number already been assigned to another entry?
			$flag_jnum_assign_other_entry[] = $judging_number."*".$_POST['eid'.$id];
			$insert_log_sql = sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES ('%s', '%s', '3# Entry: %s, you tried to assign judging number: %s but it was already assigned to different entry.');", 
			  $prefix."barcode_log", $_SESSION["user_name"], $_POST['eid'.$id], $_POST['eid'.$id], $judging_number);
			mysqli_query($connection, $insert_log_sql) or die (mysqli_error($connection));
			$skip_update = 1;
		}
		elseif ($row_enum['brewReceived'] == 1) { // 4. Has the entry already been received?
		  $flag_enum_already_received[] = $_POST['eid'.$id];
		  
		  $insert_log_sql = sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES ('%s', '%s', '4# The following entry already received in database: %s');", 
			  $prefix."barcode_log", $_SESSION["user_name"], $_POST['eid'.$id], $_POST['eid'.$id]);
			mysqli_query($connection, $insert_log_sql) or die (mysqli_error($connection));
			$skip_update = 1;
		}
		elseif (intval($_POST['tableNumber'.$id]) != $row_table["tableNumber"]) // 5. Does the table number on the entry form match the database?
		  {
		    $mismatch_table[] = $row_table["tableNumber"] . "*" . $_POST['eid'.$id] . "*" . $_POST['tableNumber'.$id];
		    
		    $insert_log_sql = sprintf("INSERT INTO %s (user_name, entrynum, errortext) VALUES ('%s', '%s', '5# Entry %s table mismatch, Entry sheet says %s, DB says %s');", 
			  $prefix."barcode_log", $_SESSION["user_name"], $_POST['eid'.$id], $_POST['eid'.$id], $_POST['tableNumber'.$id], $row_table["tableNumber"]);
			  mysqli_query($connection, $insert_log_sql) or die (mysqli_error($connection));
		    $skip_update = 1;
		  }

				
		if ($totalRows_enum > 0) {
			
			if ($skip_update == 0) {
				
				$eid = ltrim($_POST['eid'.$id],"0");
				
				$entries_updated[] = number_pad($_POST['eid'.$id],4);
				
				
				if ((isset($_POST['brewPaid'.$id])) && ($_POST['brewPaid'.$id] == 1)) $brewPaid = 1; else $brewPaid = $row_enum['brewPaid'];
				
				
				$updateSQL = sprintf("UPDATE %s SET brewReceived='1', brewJudgingNumber='%s', brewBoxNum='%s', brewPaid='%s' WHERE id='%s';",$brewing_db_table,$judging_number, $_POST['box'.$id],$brewPaid,$eid);
				mysqli_real_escape_string($connection,$updateSQL);
				$result = mysqli_query($connection,$updateSQL) or die (mysqli_error($connection));

			}
		}
	}
}
	
$entry_list .= display_array_content($entries_updated,2);

?>