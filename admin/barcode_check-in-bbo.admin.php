<?php 
/**
 * Module:      barcode_check-in-bbo.admin.php 
 * Description: Modified for Bluebonnet Brewoff
 * 
 */ 

error_reporting(E_ALL);
ini_set('display_errors', '1');

$fields = 24;
$entry_list = "";
$flag_enum_not_found = [];
$flag_enum_not_found_info = "";
$flag_entry_prev_assigned_jnum = [];
$flag_entry_prev_assigned_jnum_info = "";
$flag_jnum_assign_other_entry = [];
$flag_jnum_assign_other_entry_info = "";
$flag_enum_already_received = [];
$flag_enum_already_received_info = "";
$mismatch_table = [];
$mismatch_table_info = "";


$skip_update = 0;


$barcode_text_000 = "Check-In Entries with a Barcode Reader/Scanner modified for Bluebonnet";
$barcode_text_001 = "The following entries have been checked in";
$barcode_text_002 = "Attempt to reuse judging number, the following entries have judging numbers assigned to other entries.";
$barcode_text_003 = "The following entry numbers were not found.";
$barcode_text_004 = "The following entries were already assigned judging numbers.";
$barcode_text_005 = "The following entries already received in database";
$barcode_text_006 = "The following entries have mismatched table numbers between entry sheet and database";
$barcode_text_007 = "";
$barcode_text_008 = "";
$barcode_text_009 = "";
$barcode_text_010 = "";
$barcode_text_011 = "";
$barcode_text_012 = "";
$barcode_text_013 = "";
$barcode_text_014 = "";
$barcode_text_015 = "";
$barcode_text_016 = "";
$barcode_text_017 = "";
$barcode_text_018 = "";
$barcode_text_019 = "";
$barcode_text_020 = "";





if ((NHC) && ($prefix == "final_")) $maxlength = 6; else $maxlength = 4;

// Update upon submitting the form
if ($action == "add") {
  include(INCLUDES.'process/process_barcode_check_in_bbo.inc.php');
}

if ($filter == "box-paid") {
    $switch_to_button = "Judging/Entry Numbers Only";
    $switch_to_link = $base_url."index.php?section=admin&amp;go=checkin";
}
else {
    $switch_to_button = "Entry/Judging Numbers, Box, and Paid";
    $switch_to_link = $base_url."index.php?section=admin&amp;go=checkin&amp;filter=box-paid";
}
?>
<script type="text/javascript">
function moveOnMax(field,nextFieldID){
  if(field.value.length >= field.maxLength){
    document.getElementById(nextFieldID).focus();
  }
}
function moveOnCheck(field,nextFieldID){
    document.getElementById(nextFieldID).focus();
}
document.form1.first.focus();
var p = false;
</script>
<script type="text/javascript">
$(function() {
 
    $("form").bind("keypress", function(e) {
            if (e.keyCode == 13) return false;
      });
 
});
</script>

<script type="text/javascript">
  function jsetbox(){
    var input;
    for (var i = 1; i <= 24; i++){
    input = document.getElementById("box" + i);
    input.value = document.getElementById('setBox').value;
  }
}
</script>

<p class="lead"><?php echo $_SESSION['contestName'].": ".$barcode_text_000; ?></p>

<?php
// Start of Entries checked in
if (!empty($entry_list)) { 
$entry_list = rtrim($entry_list,", ");
$entry_list = ltrim($entry_list, ", ");
?>
<div class="well">
  <p><span class="fa fa-info-circle"></span> <?php echo sprintf("%s: %s", $barcode_text_001, rtrim($entry_list,", ")); ?></p>
</div>
<?php } // End of Entries checked in

// Build list of enums not found
if (!empty($flag_enum_not_found)) { 
  foreach ($flag_enum_not_found as $num) {
    if (!empty($num)) {
     $flag_enum_not_found_info .= "<li>".$num." - not found</li>";
    }
  }
?>
<div class="alert alert-warning">
  <p><span class="fa fa-info-circle"></span> <?php echo $barcode_text_003; ?></p>
  <ul class="small">
  <?php echo $flag_enum_not_found_info; ?>
    </ul>
</div>
<?php } 

// Build list of entry numbers that already had jnum set
if (!empty($flag_entry_prev_assigned_jnum)) { 
  foreach ($flag_entry_prev_assigned_jnum as $num) {
    if (!empty($num)) {
      $num = explode("*",$num);
      $flag_entry_prev_assigned_jnum_info .= "<li>Entry ".number_pad($num[1],4)." has already been assigned judging number ".$num[0].", you tried to assign ".$num[2]."</li>";
    }
  }
?>
<div class="alert alert-warning">
  <p><span class="fa fa-info-circle"></span> <?php echo $barcode_text_004; ?></p>
  <ul class="small">
  <?php echo $flag_entry_prev_assigned_jnum_info; ?>
    </ul>
</div>
<?php }


// Build list of already jnums already assigned to other entries  
if (!empty($flag_jnum_assign_other_entry)) { 
  foreach ($flag_jnum_assign_other_entry as $num) {
    if ($num != "") {
      $num = explode("*",$num);
      $flag_jnum_assign_other_entry_info .= "<li>On entry number: ".number_pad($num[1],4).", you tried to assign judging number: ". $num[0] ." but it was already assigned to different entry.</li>";
    }
  }
?>
<div class="alert alert-warning">
    <p><span class="fa fa-info-circle"></span> <?php echo $barcode_text_002; ?></p>
    <ul class="small"><?php echo $flag_jnum_assign_other_entry_info; ?></ul>
</div>
<?php } 

// Build list of entries already marked received in the database
if (!empty($flag_enum_already_received)) { 
  foreach ($flag_enum_already_received as $num) {
    if ($num != "") {
      $flag_enum_already_received_info .= "<li>".$num." - already received</li>";
    }
  }
?>
<div class="alert alert-warning">
    <p><span class="fa fa-info-circle"></span> <?php echo $barcode_text_005; ?></p>
    <ul class="small"><?php echo $flag_enum_already_received_info; ?></ul>
</div>
<?php }  

// Build list of mismatched tables database to bottle labels
if (!empty($mismatch_table)) { 
  foreach ($mismatch_table as $num) {
    if ($num != "") {
      $num = explode("*",$num);
      $mismatch_table_info .= "<li>Entry " . $num[1] . " table mismatch, Entry sheet says " . $num[2] . ", DB says " . $num[0] . "</li>";
    }
  }
?>
<div class="alert alert-warning">
    <p><span class="fa fa-info-circle"></span> <?php echo $barcode_text_006; ?></p>
    <ul class="small"><?php echo $mismatch_table_info; ?></ul>
</div>
<?php }  
?>


<div class="bcoem-admin-element">
    <p>Use the form below to check in entries into the system using a barcode reader/scanner.</p>
    <p>Leave the Judging Number field blank if you wish to use the system- or user-generated judging number already assigned to the entry.</p>
</div>
<div class="bcoem-admin-element" style="margin-bottom: 25px;">
    <a href="<?php echo $switch_to_link; ?>" class="btn btn-xs btn-primary">Switch View to <?php echo $switch_to_button; ?></a>
    <button type="button" class="btn btn-xs btn-info" data-toggle="modal" data-target="#barcodeInfoModal">
          Barcode Check-In Info
    </button>
</div>
<!-- Modal -->
<div class="modal fade" id="barcodeInfoModal" tabindex="-1" role="dialog" aria-labelledby="barcodeInfoModalLabel">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header bcoem-admin-modal">
                <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
                <h4 class="modal-title" id="barcodeInfoModalLabel">Barcode Check-In Info</h4>
            </div>
            <div class="modal-body">
                <p>You can check-in up to <?php echo $fields; ?> entries at a time. You can also record each entry's box location <?php if (!NHC) { ?>and whether the entry has been paid<?php } ?>.</p>
                    <ul>
                      <li>The cursor will move automatically between fields if the maximum number of characters is input (<?php echo $maxlength; ?> for Entry Number, 6 for Judging Number, and 5 for Box Number).</li>
                      <li>Use the TAB key to move between fields, to skip a field, or if the cursor does not move after data is input.</li>
                      <li>Use the space bar to place a checkmark in the &quot;Paid&quot; box.</li>
                    </ul>
                <p>This function was developed to be used with a barcode reader/scanner in conjunction with the Judging Number Barcode Labels and the Judging Number Round Labels <a class="hide-loader" href="http://www.brewcompetition.com/barcode-labels" target="_blank">available for download at brewcompetition.com</a>. See the <a class="hide-loader" href="http://www.brewcompetition.com/barcode-check-in" target="_blank">suggested usage instructions</a>.</p>
                <p>However, this function can simply be used as a quick way to check-in entries without the use of the Judging Number Barcode Labels - simply leave the Judging Number field blank to use the system- or user-generated judging number already assigned to the entry.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-danger" data-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div><!-- ./modal -->
</div>
<form method="post" action="<?php echo $base_url; ?>index.php?section=admin&amp;go=checkin&amp;action=add" id="form1" onsubmit = "return(p)">
<div class="form-inline">

  <b>Set All Boxes<b/>
  <input type="text" class="form-control" id="setBox" onkeyup="jsetbox()" /><br><br>
  <?php for ($i=1; $i <= $fields; $i++) { ?>
    <div class="bcoem-admin-element hidden-print">
      <input type="hidden" name="id[]" value="<?php echo $i; ?>">
      <div class="form-group">
        <label for="">Entry Number</label>
        <input type="text" class="form-control" maxlength="<?php echo $maxlength; ?>" id="eid<?php echo $i; ?>" name="eid<?php echo $i; ?>" onkeyup="moveOnMax(this,'tableNumber<?php echo $i; ?>')" /><?php if ($i == "1") { ?><script>document.getElementById('eid1').focus()</script><?php } ?>
      </div>

      <div class="form-group">
        <label for="">Table Number</label>
        <input type="text" class="form-control" maxlength="2" id="tableNumber<?php echo $i; ?>" name="tableNumber<?php echo $i; ?>" onkeyup="moveOnMax(this,'judgingNumber<?php echo ($i); ?>')" />
      </div>

      <div class="form-group">
        <label for="">Judging Number</label>
        <input type="text" class="form-control" maxlength="6" id="judgingNumber<?php echo $i; ?>" name="judgingNumber<?php echo $i; ?>" onkeyup="moveOnMax(this,'eid<?php echo ($i+1); ?>')" />
      </div>
      <div class="form-group">
        <label for="">Box Number</label>
        <input type="text" class="form-control" maxlength="5" id="box<?php echo $i; ?>" name="box<?php echo $i; ?>"  onkeyup="moveOnMax(this,'brewPaid<?php echo ($i); ?>')" />
      </div>
  <?php if ($_SESSION['prefsPayToPrint'] == "N") { ?>
      <div class="form-group">
        <label for="">Paid</label>
        <input type="checkbox" class="form-control" id="brewPaid<?php echo $i; ?>" name="brewPaid<?php echo $i; ?>" value="1" onClick="moveOnCheck(this,'eid<?php echo ($i+1); ?>')" />
      </div>
  <?php } ?>
    </div>
    <?php } ?>
</div>
<p><input type="submit" value="Check-In Entries" class="btn btn-primary" onClick = "javascript: p=true;"/></p>
</form>
