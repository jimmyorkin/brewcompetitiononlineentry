<?php
	
$entries_updated[] = "";

//echo "Post=", print_r($_POST);

/*
Here are the tests for an entry.
1. Does the entry number exist in the brewing table
2. Has this entry alread been assigned a judging number. Determined by the judging number being less than or equal to 9999
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
		
				// Check to see if the judging number has already been used and if so, flag it
				$query_jnum = sprintf("SELECT COUNT(*) AS 'count' FROM %s WHERE brewJudgingNumber='%s'",$prefix."brewing",$judging_number);
				$jnum = mysqli_query($connection,$query_jnum) or die (mysqli_error($connection));
				$row_jnum = mysqli_fetch_assoc($jnum);
				
				// Get Table Number to match against entry form
				// First get id of style from brewing and style tables
				$query_styleid_in_DB = sprintf("SELECT a.id FROM %s a, %s b WHERE brewStyleGroup = brewCategorySort and brewStyleNum = brewSubCategory and brewStyleVersion = 'BJCP2015' AND b.id = %u", $prefix."styles", $prefix."brewing", $_POST['eid'.$id]);

				$styleid_in_DB = mysqli_query($connection,$query_styleid_in_DB) or die (mysqli_error($connection));
				$row_styleid_in_DB = mysqli_fetch_assoc($styleid_in_DB);
				
				if ($row_styleid_in_DB['id'] == 99)
				  {
				    $likeString = "'99%'";
				  }
				else
				  {
				    $likeString = "'%" . strval($row_styleid_in_DB['id']) . "%'";
				  }
				
		    // The get the table number from the table table
				$query_table = sprintf("SELECT tableNumber FROM %s WHERE tableStyles LIKE %s", $prefix."judging_tables", $likeString);

				$table = mysqli_query($connection,$query_table) or die (mysqli_error($connection));
				$row_table = mysqli_fetch_assoc($table);
		}
			
		if ($totalRows_enum == 0) {
			$flag_enum_not_found[] = $_POST['eid'.$id];
			$skip_update = 1;
		}
		elseif (intval($row_enum['brewJudgingNumber']) <= 9999) {
			$flag_entry_prev_assigned_jnum[] = $row_enum['brewJudgingNumber']."*".$_POST['eid'.$id]."*".$judging_number;
			$skip_update = 1;
		}
		elseif ($row_jnum['count'] > 0) {
			$flag_jnum_assign_other_entry[] = $judging_number."*".$_POST['eid'.$id];
			$skip_update = 1;
		}
		elseif ($row_enum['brewReceived'] == 1) {
		  $flag_enum_already_received[] = $_POST['eid'.$id];
			$skip_update = 1;
		}
		elseif (intval($_POST['tableNumber'.$id]) != $row_table["tableNumber"])
		  {
		    $mismatch_table[] = $row_table["tableNumber"] . "*" . $_POST['eid'.$id] . "*" . $_POST['tableNumber'.$id];
		    $skip_update = 1;
		  }

				
		if ($totalRows_enum > 0) {
			
			if ($skip_update == 0) {
				if ($prefix == "final_") {
					if ($_POST['eid'.$id] < 9) $eid = ltrim($_POST['eid'.$id],"00000");
					elseif (($_POST['eid'.$id] >= 10) && ($_POST['eid'.$id] <= 99)) $eid = ltrim($_POST['eid'.$id],"0000");
					elseif (($_POST['eid'.$id] >= 100) && ($_POST['eid'.$id] <= 999)) $eid = ltrim($_POST['eid'.$id],"000");
					elseif (($_POST['eid'.$id] >= 1000) && ($_POST['eid'.$id] <= 9999)) $eid = ltrim($_POST['eid'.$id],"00");
					elseif (($_POST['eid'.$id] >= 10000) && ($_POST['eid'.$id] <= 99999)) $eid = ltrim($_POST['eid'.$id],"0");
					else $eid = $_POST['eid'.$id];
					$entries_updated[] = number_pad($_POST['eid'.$id],6);
				}
				
				else {
					if ($_POST['eid'.$id] < 9) $eid = ltrim($_POST['eid'.$id],"000");
					elseif (($_POST['eid'.$id] >= 10) && ($_POST['eid'.$id] <= 99)) $eid = ltrim($_POST['eid'.$id],"00");
					elseif (($_POST['eid'.$id] >= 100) && ($_POST['eid'.$id] <= 999)) $eid = ltrim($_POST['eid'.$id],"0");
					else $eid = $_POST['eid'.$id];
					$entries_updated[] = number_pad($_POST['eid'.$id],4);
				}
				
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