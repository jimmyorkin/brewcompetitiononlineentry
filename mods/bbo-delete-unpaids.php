<?php
/**
 * Module:      bbo-delete-unpaids.php
 * Description: This module logically deletes entries older than 1 hour and unpaid
 */

$bbo_query_deletes =
"SELECT id
FROM `brewing_bbo_real`
WHERE brewUpdated < DATE_SUB(NOW(), INTERVAL '1' HOUR) -- older that 1 hour
  and (`brewPaid` is NULL or brewPaid = 0) -- has not been paid
  and bboLogicallyDeleted <> 1 -- Has not already been logically deleted;";

$bbo_select_result    = mysqli_query($connection, $bbo_query_deletes, MYSQLI_STORE_RESULT) or die (mysqli_error($connection));
$bbo_totalRows_delete = mysqli_num_rows($bbo_select_result);

if ($bbo_totalRows_delete <> 0)
{
	while ($bbo_select_row = mysqli_fetch_assoc($bbo_select_result))
	{
		$bbo_logical_delete = sprintf("update brewing_bbo_real set bboLogicallyDeleted = 1, bboLogicallyDeletedTime = now() where id = %u;", $bbo_select_row['id']);
		$bbo_logical_delete = $bbo_logical_delete . sprintf("insert into barcode_log (user_name, entrynum, errortext) VALUES ('1-hour-logical-delete', %u, 'marked logically deleted');", $bbo_select_row['id']);
		mysqli_multi_query($connection, $bbo_logical_delete) or die (mysqli_error($connection));
    while (mysqli_next_result($connection)) {;} // flush multi_queries
	}
}  

mysqli_free_result($bbo_select_result);

?>