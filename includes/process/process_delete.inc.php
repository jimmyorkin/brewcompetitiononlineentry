<?php
/*
 * Module:      process_delete.inc.php
 * Description: This module does all the heavy lifting for all DB deletes: new entries,
 *              new users, organization, etc.
 */

if ((isset($_SERVER['HTTP_REFERER'])) && ((isset($_SESSION['loginUsername'])) && (isset($_SESSION['userLevel'])))) {

	$db_conn->where('user_name', $_SESSION['loginUsername']);
	$row_user = $db_conn->getOne($users_db_table, "id,userLevel");

	$admin_user = FALSE;
	$admin_superuser = FALSE;
	
	if ($row_user['userLevel'] == 0) {
		$admin_user = TRUE;
		$admin_superuser = TRUE;
	}

	if ($row_user['userLevel'] == 1) $admin_user = TRUE;

	$errors = FALSE;
	$error_output = array();
	$_SESSION['error_output'] = "";

	if (($admin_user) && ($go == "image")) {
		
		$upload_dir = (USER_IMAGES);
		unlink($upload_dir.$filter);
		if ($view == "html") $deleteGoTo = $base_url."index.php?section=admin&go=upload&action=html&msg=31";
		else $deleteGoTo = $base_url."index.php?section=admin&go=upload&msg=31";
		
		$deleteGoTo = prep_redirect_link($deleteGoTo);
		$redirect_go_to = sprintf("Location: %s", $deleteGoTo);

	}

	elseif (($admin_user) && ($go == "doc")) {
		
		$upload_dir = (USER_DOCS);
		unlink($upload_dir.$filter);
		if ($view == "html") $deleteGoTo = $base_url."index.php?section=admin&go=upload_scoresheets&action=html&msg=31";
		else $deleteGoTo = $base_url."index.php?section=admin&go=upload_scoresheets&msg=31";
		
		$deleteGoTo = prep_redirect_link($deleteGoTo);
		$redirect_go_to = sprintf("Location: %s", $deleteGoTo);

	}

	elseif (($admin_superuser) && ($go == "judging_scores")) {

		$update_table = $prefix."judging_scores";
		$db_conn->where ('id', $id);
		$result = $db_conn->delete($update_table);
		if (!$result) {
			$error_output[] = $db_conn->getLastError();
			$errors = TRUE;
		}

		$deleteGoTo = prep_redirect_link($deleteGoTo);
		$redirect_go_to = sprintf("Location: %s", $deleteGoTo);

	}

	elseif (($admin_superuser) && ($go == "special_best")) {

		$db_conn->where ('id', $id);
		$result = $db_conn->delete($dbTable);
		if (!$result) {
			$error_output[] = $db_conn->getLastError();
			$errors = TRUE;
		}

		$db_conn->where('sid', $id);
		$rows_delete_assign = $db_conn->get($special_best_data_db_table, null, "id");

		if (!empty($rows_delete_assign)) {

			foreach ($rows_delete_assign as $row_delete_assign) {

				$aid = $row_delete_assign['id'];

				// Note: this duplicate delete of the same row by the same id existed in
				// the original code (two DELETEs on the same table/id back to back) -
				// preserved as a harmless no-op, matching upstream/master's own identical
				// conversion, since only the query parameterization changed here.
				$update_table = $special_best_data_db_table;
				$db_conn->where ('id', $aid);
				$result = $db_conn->delete($update_table);
				if (!$result) {
					$error_output[] = $db_conn->getLastError();
					$errors = TRUE;
				}

				$db_conn->where('id', $aid);
				$db_conn->delete($special_best_data_db_table);
			}
		}

	}

	elseif (($admin_user) && ($go == "judging")) {

		// remove relational location ids from affected rows in brewer's table
		$rows_loc = $db_conn->get($brewer_db_table, null, "id, brewerJudgeLocation, brewerStewardLocation");

		if (!empty($rows_loc)) {

			foreach ($rows_loc as $row_loc) {

				if ($row_loc['brewerJudgeLocation'] != "") {

				$a = explode(",",$row_loc['brewerJudgeLocation']);

					if ((in_array("Y-".$id,$a)) || (in_array("N-".$id,$a))) {

						foreach ($a as $b) {
							if ($b == "Y-".$id) $c[] = "";
							elseif ($b == "N-".$id) $c[] = "";
							else $c[] = $b.",";
						}

						$d = rtrim(implode("",$c),",");

						$update_table = $prefix."brewer";
						$data = array('brewerJudgeLocation' => $d);
						$db_conn->where ('id', $row_loc['id']);
						$result = $db_conn->update ($update_table, $data);
						if (!$result) {
							$error_output[] = $db_conn->getLastError();
							$errors = TRUE;
						}

						unset($c, $d);

					}

				unset($a);

				}

				if ($row_loc['brewerStewardLocation'] != "") {
				$e = explode(",",$row_loc['brewerStewardLocation']);
					if ((in_array("Y-".$id,$e)) || (in_array("N-".$id,$e))) {

						foreach ($e as $f) {

							if ($f == "Y-".$id) $g[] = "";
							elseif ($f == "N-".$id) $g[] = "";
							else $g[] = $f.",";

						}

						$h = rtrim(implode("",$g),",");

						$update_table = $prefix."brewer";
						$data = array('brewerStewardLocation' => $h);
						$db_conn->where ('id', $row_loc['id']);
						$result = $db_conn->update ($update_table, $data);
						if (!$result) {
							$error_output[] = $db_conn->getLastError();
							$errors = TRUE;
						}

						unset($g, $h);

					}

				unset($e);

				}

			}

		}

		$update_table = $prefix."judging_locations";
		$db_conn->where ('id', $id);
		$result = $db_conn->delete($update_table);
		if (!$result) {
			$error_output[] = $db_conn->getLastError();
			$errors = TRUE;
		}

	} // end if ($go == "judging")

	elseif (($admin_superuser) && ($go == "participants")) {

		if ($uid != "") {

			$update_table = $prefix."users";
			$db_conn->where ('id', $id);
			$result = $db_conn->delete($update_table);
			if (!$result) {
				$error_output[] = $db_conn->getLastError();
				$errors = TRUE;
			}

			$update_table = $prefix."brewer";
			$db_conn->where ('uid', $id);
			$result = $db_conn->delete($update_table);
			if (!$result) {
				$error_output[] = $db_conn->getLastError();
				$errors = TRUE;
			}

			$db_conn->where('brewBrewerID', $id);
			$rows_entries = $db_conn->get($brewing_db_table, null, "id");

			$a = array();
			foreach ($rows_entries as $row_entries) { $a[] = $row_entries['id']; }

				sort($a);

				foreach ($a as $brew_id) {

					$update_table = $prefix."brewing";
					$db_conn->where ('id', $brew_id);
					$result = $db_conn->delete($update_table);
					if (!$result) {
						$error_output[] = $db_conn->getLastError();
						$errors = TRUE;
					}

					$update_table = $prefix."judging_scores";
					$db_conn->where ('eid', $brew_id);
					$result = $db_conn->delete($update_table);
					if (!$result) {
						$error_output[] = $db_conn->getLastError();
						$errors = TRUE;
					}

					$update_table = $prefix."judging_scores_bos";
					$db_conn->where ('eid', $brew_id);
					$result = $db_conn->delete($update_table);
					if (!$result) {
						$error_output[] = $db_conn->getLastError();
						$errors = TRUE;
					}

				}

			// Clear any Judging Assignments
			$db_conn->where('bid', $id);
			$rows_judge_assign = $db_conn->get($judging_assignments_db_table, null, "id");

			$b = array();
			foreach ($rows_judge_assign as $row_judge_assign) { $b[] = $row_judge_assign['id']; }

				sort($b);

				foreach ($b as $judge_id) {

					$update_table = $prefix."judging_assignments";
					$db_conn->where ('id', $judge_id);
					$result = $db_conn->delete($update_table);
					if (!$result) {
						$error_output[] = $db_conn->getLastError();
						$errors = TRUE;
					}

				}

			// Clear any Staff Assignments
			$db_conn->where('uid', $id);
			$rows_staff_assign = $db_conn->get($prefix."staff", null, "id");

			$c = array();
			foreach ($rows_staff_assign as $row_staff_assign) { $c[] = $row_staff_assign['id']; }

				sort($c);

				foreach ($c as $staff_id) {

					$update_table = $prefix."staff";
					$db_conn->where ('id', $staff_id);
					$result = $db_conn->delete($update_table);
					if (!$result) {
						$error_output[] = $db_conn->getLastError();
						$errors = TRUE;
					}

				}

		} else {

			$update_table = $prefix."users";
			$db_conn->where ('id', $id);
			$result = $db_conn->delete($update_table);
			if (!$result) {
				$error_output[] = $db_conn->getLastError();
				$errors = TRUE;
			}

			$update_table = $prefix."brewer";
			$db_conn->where ('uid', $id);
			$result = $db_conn->delete($update_table);
			if (!$result) {
				$error_output[] = $db_conn->getLastError();
				$errors = TRUE;
			}

		}

	} // end if ($go == "participants")

	elseif (($admin_user) && ($go == "entries")) {

		$db_conn->where ('id', $id);
		$result = $db_conn->delete($dbTable);
		if (!$result) {
			$error_output[] = $db_conn->getLastError();
			$errors = TRUE;
		}

		$db_conn->where('eid', $id);
		$row_delete_entry = $db_conn->getOne($judging_scores_db_table, "id");

		if ($row_delete_entry) {

			$update_table = $prefix."judging_scores";
			$db_conn->where ('id', $row_delete_entry['id']);
			$result = $db_conn->delete($update_table);
			if (!$result) {
				$error_output[] = $db_conn->getLastError();
				$errors = TRUE;
			}

		}			

	} // end if ($go == "entries")

	elseif (($admin_user) && ($go == "judging_tables")) {

		// NOTE (found, not fixed - out of scope for this SQLi parameterization pass):
		// this selects from judging_scores by scoreTable, then deletes from
		// judging_assignments using judging_scores.id values - two unrelated tables'
		// primary keys conflated. upstream/master's own GitHub issue #1751 identifies
		// this as a real bug (judging_assignments rows for this table are never
		// actually cleared, and an unrelated assignment row elsewhere that happens to
		// share that numeric id could be deleted instead) and fixes it by deleting
		// judging_assignments WHERE assignTable=$id directly. That fix is paired in
		// upstream with an 11-file INSERT-side guard (commit 8d0f393a) and is not
		// safe to adopt in isolation here without changing this function's observable
		// behavior - preserved exactly as-is, parameterization only.
		$db_conn->where('scoreTable', $id);
		$rows_delete_assign = $db_conn->get($judging_scores_db_table, null, "id");

		$a = array();
		$b = array();
		$c = array();

		if (!empty($rows_delete_assign)) {

			foreach ($rows_delete_assign as $row_delete_assign) {

				$aid = $row_delete_assign['id'];

				$update_table = $prefix."judging_assignments";
				$db_conn->where ('id', $aid);
				$result = $db_conn->delete($update_table);
				if (!$result) {
					$error_output[] = $db_conn->getLastError();
					$errors = TRUE;
				}

			}

			$db_conn->where('scoreTable', $id);
			$rows_delete_scores = $db_conn->get($judging_scores_db_table, null, "id,eid");

			foreach ($rows_delete_scores as $row_delete_scores) { $a[] = $row_delete_scores['id']; $c[] = $row_delete_scores['eid']; }

			foreach ($a as $sid) {

				$update_table = $prefix."judging_scores";
				$db_conn->where ('id', $sid);
				$result = $db_conn->delete($update_table);
				if (!$result) {
					$error_output[] = $db_conn->getLastError();
					$errors = TRUE;
				}

			}

		}

		$db_conn->where('flightTable', $id);
		$rows_delete_flights = $db_conn->get($judging_flights_db_table, null, "id,flightTable");

		if (!empty($rows_delete_flights)) {

			foreach ($rows_delete_flights as $row_delete_flights) { $b[] = $row_delete_flights['id']; }

			foreach ($b as $fid) {

				$update_table = $prefix."judging_flights";
				$db_conn->where ('id', $fid);
				$result = $db_conn->delete($update_table);
				if (!$result) {
					$error_output[] = $db_conn->getLastError();
					$errors = TRUE;
				}

			}

			if ($c != "") {

				foreach ($c as $eid) {

					$db_conn->where('eid', $eid);
					$row_delete_bos = $db_conn->getOne($judging_scores_bos_db_table, "id,eid");

					if ($eid == $row_delete_bos['eid']) {

						$update_table = $prefix."judging_scores_bos";
						$db_conn->where ('id', $row_delete_bos['id']);
						$result = $db_conn->delete($update_table);
						if (!$result) {
							$error_output[] = $db_conn->getLastError();
							$errors = TRUE;
						}

						// Note: duplicate delete of the same row, preserved as a harmless
						// no-op - pre-existing behavior, matching upstream's own identical
						// conversion of this exact spot, not changed by parameterization.
						$db_conn->where('id', $row_delete_bos['id']);
						$db_conn->delete($judging_scores_bos_db_table);
					}

				}

			}

		}

		$db_conn->where ('id', $id);
		$result = $db_conn->delete($dbTable);
		if (!$result) {
			$error_output[] = $db_conn->getLastError();
			$errors = TRUE;
		}

	} // end if ($go == "judging_tables")

	elseif (($admin_superuser) && ($go == "archive")) {

		// $filter is spliced directly into DROP TABLE table names below. It is only
		// sterilize()'d (XSS-entity-encoding + SQL-string-quote-escaping), never
		// identifier-restricted, so an unescapable identifier-injection surface exists
		// in this DDL path pre-conversion. Backported from the same hardening already
		// applied to get_entry_count()/get_participant_count()/brewer_info() in Task
		// 1f - not an invented check, just the established fix for this exact class of
		// request-derived-value-in-a-table-name gap applied to this call site too.
		$filter_clean = preg_replace("/[^a-zA-Z0-9]+/", "", $filter);
		$delete_suffix = "_".$filter_clean;

		$drop_tables_array = array(
			$prefix."brewer".$delete_suffix,
			$prefix."brewing".$delete_suffix,
			$prefix."evaluation".$delete_suffix,
			$prefix."judging_assignments".$delete_suffix,
			$prefix."judging_flights".$delete_suffix,
			$prefix."judging_scores".$delete_suffix,
			$prefix."judging_scores_bos".$delete_suffix,
			$prefix."judging_tables".$delete_suffix,
			$prefix."special_best_data".$delete_suffix,
			$prefix."special_best_info".$delete_suffix,
			$prefix."staff".$delete_suffix,
			$prefix."style_types".$delete_suffix,
			$prefix."users".$delete_suffix
		);
		
		foreach ($drop_tables_array as $table) {
			
			if (check_setup($table,$database)) {

				$sql = sprintf("DROP TABLE %s", $table);
				$db_conn->rawQuery($sql);
				if ($db_conn->getLastErrno() !== 0) {
					$error_output[] = $db_conn->getLastError();
					$errors = TRUE;
				}
				
			}

		}

		$db_conn->where ('id', $id);
		$result = $db_conn->delete($dbTable);
		if (!$result) {
			$error_output[] = $db_conn->getLastError();
			$errors = TRUE;
		}

	}

	elseif ($go == "default") {

		// Check if user is deleting their own stuff

		if ($dbTable == $prefix."brewing") {

			$entry_allow_delete = FALSE;

			if (($admin_user) || ($admin_superuser)) $entry_allow_delete = TRUE;

			if ($row_user['userLevel'] == 2) {

				$db_conn->where('brewBrewerId', $row_user['id']);
				$db_conn->where('id', $id);
				$row_brews = $db_conn->getOne($brewing_db_table, "id");

				if ($row_brews) $entry_allow_delete = TRUE;

			}

			if ($entry_allow_delete) {

				$db_conn->where ('id', $id);
				$result = $db_conn->delete($dbTable);
				if (!$result) {
					$error_output[] = $db_conn->getLastError();
					$errors = TRUE;
				}

			}

			else {

				$redirect = $base_url."index.php?msg=98";
				$redirect = prep_redirect_link($redirect);
				$redirect_go_to = sprintf("Location: %s", $redirect);
				header($redirect_go_to);
				exit();

			}

		}

		elseif (($admin_superuser) && ($dbTable == $prefix."archive")) {

			$tables_array = array($brewer_db_table, $brewing_db_table, $judging_assignments_db_table, $judging_flights_db_table, $judging_scores_db_table, $judging_scores_bos_db_table, $judging_tables_db_table, $special_best_info_db_table, $special_best_data_db_table, $sponsors_db_table, $staff_db_table, $style_types_db_table, $users_db_table);

			// Same identifier-injection hardening as the go=="archive" branch above -
			// $filter is only sterilize()'d, not identifier-restricted, before being
			// spliced into a DROP TABLE table name here.
			$filter_clean = preg_replace("/[^a-zA-Z0-9]+/", "", $filter);

			foreach ($tables_array as $table) {

				$table = $table."_".$filter_clean;

				if (table_exists($table)) {

					$sql = sprintf("DROP TABLE %s", $table);
					$db_conn->rawQuery($sql);
					if ($db_conn->getLastErrno() !== 0) {
						$error_output[] = $db_conn->getLastError();
						$errors = TRUE;
					}

				}

			}

		}

		else {

			if ($admin_superuser) {
				
				$db_conn->where ('id', $id);
				$result = $db_conn->delete($dbTable);
				if (!$result) {
					$error_output[] = $db_conn->getLastError();
					$errors = TRUE;
				}
			
			}

		}

	}

	else {

		if ($admin_superuser) {
			
			$db_conn->where ('id', $id);
			$result = $db_conn->delete($dbTable);
			if (!$result) {
				$error_output[] = $db_conn->getLastError();
				$errors = TRUE;
			}
		
		}

	}

	if (!empty($error_output)) $_SESSION['error_output'] = $error_output;

	if ($errors) $deleteGoTo = $base_url."index.php?section=admin&msg=3";
	$deleteGoTo = prep_redirect_link($deleteGoTo);
	$redirect_go_to = sprintf("Location: %s", $deleteGoTo);

} else {

	$redirect = $base_url."index.php?msg=98";
	$redirect = prep_redirect_link($redirect);
	$redirect_go_to = sprintf("Location: %s", $redirect);

}
?>