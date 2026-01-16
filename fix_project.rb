require 'xcodeproj'

project_path = 'tools/girlai2/ios/Runner.xcodeproj'
file_path = 'GoogleService-Info.plist'

puts "Opening project at #{project_path}"
project = Xcodeproj::Project.open(project_path)

# Find the Runner group - correct method is []
runner_group = project.main_group['Runner']

unless runner_group
  puts "Error: Runner group not found!"
  exit 1
end

# Check if file is already there
file_ref = runner_group.find_file_by_path(file_path)

if file_ref
  puts "File reference already exists."
else
  puts "Adding file reference..."
  # 'new_file' adds it to the group
  file_ref = runner_group.new_file(file_path)
end

# Add to targets
project.targets.each do |target|
  if target.name == 'Runner'
    puts "Checking target #{target.name}..."
    resources_phase = target.resources_build_phase
    
    # Check if the file reference is already in the build phase
    if resources_phase.files_references.include?(file_ref)
      puts "File already in Copy Bundle Resources."
    else
      puts "Adding to Copy Bundle Resources..."
      resources_phase.add_file_reference(file_ref)
    end
  end
end

project.save
puts "Project saved."
