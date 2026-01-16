require 'xcodeproj'

project_path = 'tools/girlai2/ios/Runner.xcodeproj'
puts "Opening project at #{project_path}"
project = Xcodeproj::Project.open(project_path)

target = project.targets.find { |t| t.name == 'Runner' }
phase = target.resources_build_phase

puts "Checking 'Copy Bundle Resources' phase for duplicates of GoogleService-Info.plist..."

# Find all references to GoogleService-Info.plist in this phase
refs = phase.files.select do |f| 
  name_match = f.file_ref.display_name == 'GoogleService-Info.plist'
  path_match = f.file_ref.path && f.file_ref.path.end_with?('GoogleService-Info.plist')
  name_match || path_match
end

if refs.count > 1
  puts "Found #{refs.count} references. Removing duplicates..."
  # Keep the first one, remove the rest
  refs[1..-1].each do |ref|
    puts "Removing reference: #{ref.inspect}"
    phase.remove_build_file(ref)
  end
  project.save
  puts "Project saved. Duplicates removed."
else
  puts "No duplicates found (Count: #{refs.count})."
end
