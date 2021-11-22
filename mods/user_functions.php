<?php
/**************************************
  MJM user defined functions
**************************************/

function get_table_name($style) {

	require(CONFIG.'config.php');
    mysqli_select_db($connection,$database);
	
	$query_prefs_styleset = sprintf("SELECT prefsStyleSet FROM %s WHERE id='1'",$prefix."preferences");	
	$prefs_styleset = mysqli_query($connection,$query_prefs_styleset) or die(mysqli_error($connection));
	$row_prefs_styleset = mysqli_fetch_assoc($prefs_styleset);
	$styleSet = $row_prefs_styleset['prefsStyleSet'];

	$query_styles = sprintf("SELECT id FROM %s WHERE brewStyle = '%s' AND brewStyleVersion = '%s'",$prefix."styles",$style,$styleSet);
	$styles = mysqli_query($connection,$query_styles) or die(mysqli_error($connection));
	$style_info = mysqli_fetch_assoc($styles);

	$query_table_styles = sprintf("SELECT * FROM %s",$prefix."judging_tables");
	$table_styles = mysqli_query($connection,$query_table_styles) or die(mysql_error($connection));
	$row_table_styles = mysqli_fetch_assoc($table_styles);
	$table_info['tableNumber'] = "";
	$table_info['tableName'] = "";

	do { 
		$t_styles = explode(",",$row_table_styles['tableStyles']); 
		foreach ($t_styles as $styleid) {
			if ($styleid == $style_info['id']) {
				$table_info['tableNumber'] = $row_table_styles['tableNumber'];
				$table_info['tableName'] = $row_table_styles['tableName'];
				}
			}
	} while (($row_table_styles = mysqli_fetch_assoc($table_styles)) && ($table_info['tableNumber'] == ""));

	return $table_info;
}

?>