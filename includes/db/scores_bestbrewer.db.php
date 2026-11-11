<?php
$db_conn->where('id', '1');
$row_bb_prefs = $db_conn->getOne($prefix."preferences", "prefsBestBrewerTitle, prefsBestClubTitle, prefsFirstPlacePts, prefsSecondPlacePts, prefsThirdPlacePts, prefsFourthPlacePts, prefsHMPts, prefsTieBreakRule1, prefsTieBreakRule2, prefsTieBreakRule3, prefsTieBreakRule4, prefsTieBreakRule5, prefsTieBreakRule6, prefsBestUseBOS, prefsScoringCOA, prefsWinnerMethod");

// $bb_scores/$bb_bos_scores must remain real mysqli_result objects (not MysqliDb
// arrays) because sections/bestbrewer.sec.php and awards.php both consume them
// afterward via their own `while ($bb_row_scores = mysqli_fetch_assoc($bb_scores))`
// / `while ($bb_row_bos_scores = mysqli_fetch_assoc($bb_bos_scores))` loops -
// outside this task's assigned file list, so the producer's external contract is
// preserved exactly. Neither query takes any request-derived value (only trusted
// table-name identifiers), so there is nothing to bind - still moved off the
// legacy raw-query call form via mysqli_prepare()/get_result() for
// consistency with the rest of this conversion.
$query_scores = "SELECT a.scorePlace, a.scoreEntry, a.scoreTable, b.brewCoBrewer, b.brewCategory, b.brewCategorySort, b.brewSubCategory, c.uid, c.brewerLastName, c.brewerFirstName, c.brewerBreweryName, c.brewerClubs FROM ".$judging_scores_db_table." a, ".$brewing_db_table." b, ".$brewer_db_table." c WHERE a.eid = b.id AND c.uid = b.brewBrewerID AND a.scorePlace IS NOT NULL";
$stmt_bb_scores = mysqli_prepare($connection, $query_scores);
mysqli_stmt_execute($stmt_bb_scores);
$bb_scores = mysqli_stmt_get_result($stmt_bb_scores);
$bb_row_scores = mysqli_fetch_assoc($bb_scores);
$bb_totalRows_scores = mysqli_num_rows($bb_scores);

if ($row_bb_prefs['prefsBestUseBOS'] == 1) {
    $query_bos_scores = "SELECT a.scorePlace, a.scoreEntry, b.brewCategory, b.brewCategorySort, b.brewSubCategory, c.brewerClubs, c.uid FROM ".$judging_scores_bos_db_table." a, ".$brewing_db_table." b, ".$brewer_db_table." c WHERE a.eid = b.id AND c.uid = a.bid AND a.scorePlace IS NOT NULL";
    $stmt_bb_bos_scores = mysqli_prepare($connection, $query_bos_scores);
    mysqli_stmt_execute($stmt_bb_bos_scores);
    $bb_bos_scores = mysqli_stmt_get_result($stmt_bb_bos_scores);
    $bb_row_bos_scores = mysqli_fetch_assoc($bb_bos_scores);
    $bb_totalRows_bos_scores = mysqli_num_rows($bb_bos_scores);
}

if ($row_bb_prefs['prefsScoringCOA'] == 0) {

    $bb_points_prefs = array($row_bb_prefs['prefsFirstPlacePts'],$row_bb_prefs['prefsSecondPlacePts'],$row_bb_prefs['prefsThirdPlacePts'],$row_bb_prefs['prefsFourthPlacePts'],$row_bb_prefs['prefsHMPts']);

}

else {

    $bb_points_prefs = array();

    // Get overall entries...
    // Per table
    if ($row_bb_prefs['prefsWinnerMethod'] == 0) {

        // Query tables for ids.
        $rows_table_ids = $db_conn->get($prefix."judging_tables", null, "id");
        $totalRows_table_ids = $db_conn->count;

        if ($rows_table_ids) {

            foreach ($rows_table_ids as $row_table_ids) {

                $db_conn->where('scoreTable', $row_table_ids['id']);
                $row_table_count = $db_conn->getOne($judging_scores_db_table, "COUNT(*) AS 'count'");

                $bb_points_prefs[$row_table_ids['id']] = $row_table_count['count'];

            }

        }

    } // end if ($_SESSION['prefsWinnerMethod'] == 0)

    // Per style (use for both style and sub-style winner display methods)
    else {

        $active_styles = styles_active(0,$go);

        foreach (array_unique($active_styles) as $style) {

            if (!empty($style)) {

                include (DB.'winners_category.db.php');

                if (isset($style)) $bb_points_prefs[$style] = $row_entry_count['count'];
           
            }

        }

    }

    /*
    // Per Sub-Style
    else {

        $active_styles = styles_active(2,$go);
        
        foreach (array_unique($active_styles) as $style) {

            if (!empty($style)) {

                $style = explode("^",$style);

                include (DB.'winners_subcategory.db.php');

                if ((isset($style[0])) && (isset($style[1]))) {
                    $substyle = $style[0]."-".$style[1];
                    $bb_points_prefs[$substyle] = $row_entry_count['count'];
                }

            }

        }

    } // end else

    foreach ($bb_points_prefs as $key => $value) {
        echo $key.": ".$value."<br>";
        echo "<ul>";
        
        for ($i=1; $i <= 5; $i++) {
            
            if ($value > 0) {
                $points = pow((($value - $i) / $value),3);
                if ($points > 0) echo "<li>".$i." = ".$points." points</li>";
                else echo "<li>".$i." = 0 points</li>";
            }

            else echo "<li>".$i." = 0 points</li>";
            
        }
        
        echo "</ul>";
        
    }

    echo "<br><br>";

    */

} // end else

$bb_tiebreaker_prefs = array($row_bb_prefs['prefsTieBreakRule1'],$row_bb_prefs['prefsTieBreakRule2'],$row_bb_prefs['prefsTieBreakRule3'],$row_bb_prefs['prefsTieBreakRule4'],$row_bb_prefs['prefsTieBreakRule5'],$row_bb_prefs['prefsTieBreakRule6']);
?>