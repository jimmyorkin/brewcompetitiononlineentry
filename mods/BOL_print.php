<!--
SOME THINGS TO NOTE:
- DO NOT include <html> or <body> tags!!
- All files MUST have a .php extension (e.g., name_of_file.php - some servers running PHP are not configured to include files with other exensions).
- For the program to use any custom module, its information MUST be added into the database.
  -- The Custom Modules option must be enabled via Website Preferences
  -- The EXACT filename and other info (position, rank, description) must be entered into the database via the Add Custom Modules screen
- The corresponding file should be uploaded to the "mods" sub-folder via secure FTP.
- Custom modules can only be placed above content (just below the main navigation) or below content (just above the footer).
- You can have multiple custom modules. They will be displayed in the rank order you choose.

For assistance with Bootstrap elements, reference the Bootstrap website:
- CSS:        http://getbootstrap.com/css/
- Components: http://getbootstrap.com/components/
- JavaScript: http://getbootstrap.com/javascript/

BCOE&M uses Font Awesome icons throughout the core code. To use Font Awesome icons, reference the following:
- Font Awesome icon list:     https://fortawesome.github.io/Font-Awesome/icons/
- Font Awesome icon examples: https://fortawesome.github.io/Font-Awesome/examples/

To use Bootstrap's native icon set, glyphicons, go to http://getbootstrap.com/components/#glyphicons for a list and how to integrate
-->
<div class="container"> 
<h2>Print Bill Of Lading</h2>
	<table>
	<tr><td width="70%">
	<font size=3><strong>Warning!</strong> Per the latest TABC regulations, prior to sending your entries you <strong>MUST</strong> print a BOL form and include it with your entries!! Click the button to the right after all entries have been entered.</font>
	</td><td>
	<button onclick="location.href='mods/bol_output.php?action=comp&amp;bid=<?php echo $row_brewer['uid']; ?>'"><font size=3>Generate BOL Form</font></button>
	</td></tr>
	</table>
</div>